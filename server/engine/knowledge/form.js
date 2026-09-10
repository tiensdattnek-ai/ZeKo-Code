import { F, I } from './markup.js';

const formCode = `import { useState } from 'react';

const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

export default function ProfileForm({ onSubmit }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    // xoá lỗi của trường đó khi đang sửa
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }

  // Pure function — test unit được không cần DOM
  function validate(f) {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Tên tối thiểu 2 ký tự';
    if (!EMAIL_RE.test(f.email)) e.email = 'Email không hợp lệ';
    if (f.password.length < 8) e.password = 'Password tối thiểu 8 ký tự';
    if (f.password !== f.confirm) e.confirm = 'Xác nhận không khớp';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HTTP ' + res.status);
      if (onSubmit) onSubmit();
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Field label="Tên hiển thị" error={errors.name}>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Email" error={errors.email}>
        <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </Field>
      <Field label="Password" error={errors.password}>
        <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
      </Field>
      <Field label="Xác nhận password" error={errors.confirm}>
        <input type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} />
      </Field>
      {errors.form && <p className="form-error">{errors.form}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang lưu…' : 'Lưu hồ sơ'}
      </button>
    </form>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="error">{error}</small>}
    </label>
  );
}
`;

export default [
  {
    id: 'form',
    title: 'Form & Validation',
    keywords: [
      'form', 'form validate', 'validation', 'validate', 'biểu mẫu', 'input',
      'đăng ký', 'register form', 'form react', 'validate form',
    ],
    boost: { form: 2, validation: 2, validate: 2 },
    corpus:
      'react form với validation thuần không thư viện: controlled input, validate pure function, lỗi inline, submit async, disabled khi pending',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: form + validation. Chọn validation THUẦN (không react-hook-form/zod) ' +
        'vì form nhỏ — nhẹ và hiểu được. Cấu trúc: 1 object state, validate() là pure function (test không cần DOM), ' +
        'lỗi xoá ngay khi user sửa trường đó, submit async có pending + lỗi ở level form. Tách Field component để dry.';
      const answer =
        '# 📝 Form validation chuẩn React\n\n' +
        'Không cần thư viện — đủ sạch, đủ test được:\n\n' +
        F('jsx', 'src/components/ProfileForm.jsx', formCode) +
        'CSS tối giản cho form:\n\n' +
        F('css', 'styles/form.css', `.field {
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 14px;
}
.field input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #1e293e;
  background: #0a0e15;
  color: inherit;
  outline: none;
}
.field input:focus { border-color: #38bdf8; }
.field .error { color: #f87171; }
.form-error { color: #f87171; font-size: 14px; }`) +
        'Nguyên tắc validation đã áp dụng:\n\n' +
        '1. ' + I('validate()') + ' là pure function — test: ' + I('expect(validate(f)).toStrictEqual({})') + '\n' +
        '2. Lỗi inline theo trường, hiển thị sau lần submit đầu (không la từ lúc gõ)\n' +
        '3. ' + I('noValidate') + ' — tắt validate mặc định của browser để đồng nhất 1 bộ luật\n' +
        '4. Button disabled khi ' + I('pending') + ' — chống double submit\n\n' +
        '> 💡 **Mẹo Zeko:** form nào có > 5 trường hoặc dùng lại nhiều nơi → chuyển sang ' +
        I('react-hook-form') + ' + ' + I('zod') + ': schema dùng chung cả client lẫn server.';
      return { thought, answer };
    },
  },
];
