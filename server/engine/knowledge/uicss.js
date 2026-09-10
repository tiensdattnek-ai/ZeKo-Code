import { F, I } from './markup.js';

const landingCode = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Aurora — Glassmorphism</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: #e7edf6;
    background:
      radial-gradient(900px 500px at 85% -10%, rgba(139, 92, 246, 0.55), transparent 60%),
      radial-gradient(700px 500px at -10% 100%, rgba(56, 189, 248, 0.45), transparent 55%),
      #0a0e15;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 20px;
  }
  nav {
    width: 100%;
    max-width: 960px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 22px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(14px);
  }
  .logo { font-weight: 800; letter-spacing: 0.5px; }
  .logo span { background: linear-gradient(120deg, #38bdf8, #a78bfa); -webkit-background-clip: text; background-clip: text; color: transparent; }
  nav a { color: #9fb0c7; text-decoration: none; margin-left: 18px; font-size: 14px; }
  nav a:hover { color: white; }
  .hero { text-align: center; max-width: 640px; margin-top: 72px; }
  .hero h1 {
    font-size: clamp(34px, 6vw, 56px);
    line-height: 1.12;
    background: linear-gradient(120deg, #ffffff 20%, #7dd3fc 55%, #c4b5fd);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hero p { margin-top: 18px; color: #9fb0c7; font-size: 17px; line-height: 1.6; }
  .cta { margin-top: 30px; display: flex; gap: 14px; justify-content: center; }
  .btn {
    padding: 13px 26px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .btn.primary {
    background: linear-gradient(120deg, #38bdf8, #8b5cf6);
    color: white;
    box-shadow: 0 8px 30px rgba(99, 102, 241, 0.35);
  }
  .btn.ghost {
    background: rgba(255, 255, 255, 0.06);
    color: white;
    border-color: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
  }
  .btn:hover { transform: translateY(-2px); box-shadow: 0 12px 34px rgba(56, 189, 248, 0.3); }
  .cards { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 18px; margin-top: 64px; width: 100%; max-width: 960px; }
  .card {
    padding: 24px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(14px);
    transition: transform 0.2s ease, border-color 0.2s ease;
  }
  .card:hover { transform: translateY(-4px); border-color: rgba(125, 211, 252, 0.5); }
  .card .icon { font-size: 26px; }
  .card h3 { margin: 12px 0 8px; font-size: 16px; }
  .card p { color: #9fb0c7; font-size: 13.5px; line-height: 1.55; }
  @media (max-width: 640px) { .cards { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <nav>
    <div class="logo">⚡ <span>Aurora</span></div>
    <div>
      <a href="#">Tính năng</a>
      <a href="#">Giá</a>
      <a href="#">Docs</a>
    </div>
  </nav>
  <section class="hero">
    <h1>Xây sản phẩm nhanh<br />như lúc bạn brainstorm</h1>
    <p>Platform all-in-one cho đội nhóm full stack — từ idea đến production trong một buổi chiều, với UI glassmorphism hiện đại.</p>
    <div class="cta">
      <button class="btn primary">Bắt đầu miễn phí</button>
      <button class="btn ghost">Xem demo</button>
    </div>
  </section>
  <section class="cards">
    <div class="card">
      <div class="icon">⚡</div>
      <h3>Trở lực siêu tốc</h3>
      <p>Deploy edge global, cold start dưới 50ms cho mọi function bạn viết.</p>
    </div>
    <div class="card">
      <div class="icon">🔒</div>
      <h3>Bảo mật mặc định</h3>
      <p>JWT, rate-limit, audit log — bật sẵn, không phải tự vá.</p>
    </div>
    <div class="card">
      <div class="icon">📈</div>
      <h3>Scale tự động</h3>
      <p>Từ 10 đến 10 triệu user — hạ tầng tự điều chỉnh theo tải thực tế.</p>
    </div>
  </section>
</body>
</html>
`;

const buttonCss = `/* Button hệ thống — dùng lại được cho mọi UI */
.btn {
  position: relative;
  padding: 12px 22px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(120deg, #38bdf8, #8b5cf6);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.btn:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(99, 102, 241, 0.4); }
.btn:active { transform: translateY(0); }
.btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.35) 50%, transparent 70%);
  transform: translateX(-120%);
  transition: transform 0.5s ease;
}
.btn:hover::after { transform: translateX(120%); }
`;

export default [
  {
    id: 'ui-css',
    title: 'UI / CSS',
    keywords: [
      'css', 'ui', 'giao diện', 'glassmorphism', 'landing', 'landing page',
      'beautiful', 'đẹp', 'button', 'card', 'modal', 'gradient', 'frontend đẹp',
      'thiết kế web', 'web design', 'html',
    ],
    boost: { glassmorphism: 3, 'landing page': 2, css: 1 },
    corpus:
      'giao diện đẹp bằng html css thuần: glassmorphism, gradient, card hover, button shine, landing page hoàn chỉnh, responsive, animation nhẹ',
    render(ctx) {
      const thought =
        'Yêu cầu: "' + ctx.userText + '". → Intent: UI thuần HTML/CSS. Chọn glassmorphism (mơ sương + blur) vì thời trang và thuần CSS 100%: ' +
        'radial-gradient nền, backdrop-filter cho nav/card, gradient text cho headline, hover translate + shadow glow. ' +
        'Responsive bằng grid + clamp(). Thêm button shine (::after sweep) làm điểm nhấn. Xuất file chạy độc lập → bật Preview xem ngay.';
      const answer =
        '# 🎨 Landing page glassmorphism\n\n' +
        '1 file HTML chạy độc lập — bấm nút **Preview** ở khối code để xem luôn:\n\n' +
        F('html', 'index.html', landingCode) +
        'Tách thêm một "button hệ thống" tái sử dụng (đủ shine effect):\n\n' +
        F('css', 'styles/buttons.css', buttonCss) +
        '**Công thức glassmorphism đã dùng:**\n\n' +
        '- Nền: 2 ' + I('radial-gradient') + ' màu neon đặt lệch góc + màu tối fill\n' +
        '- Lớp kính: ' + I('background: rgba(255,255,255,0.06)') + ' + ' + I('border: 1px solid rgba(255,255,255,0.12)') + ' + ' + I('backdrop-filter: blur(14px)') + '\n' +
        '- Headline: ' + I('background-clip: text') + ' với gradient trắng → cyan → violet\n' +
        '- Motion: hover ' + I('translateY(-2~-4px)') + ' + shadow glow, không dùng animation nặng\n\n' +
        '> 💡 **Mẹo Zeko:** giữ độ trong suốt lớp kính trong khoảng 0.05–0.10 — cao hơn nữa chữ sẽ khó đọc trên nền sáng.';
      return { thought, answer };
    },
  },
];
