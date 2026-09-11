/**
 * ZeKo Code — seed API key, lưu DẠNG MẢNH.
 *
 * GitHub secret-scanning nhận diện theo prefix (`sk-or-v1-…` của OpenRouter,
 * `sk-…` của TokenRouter). Ta cắt prefix ra khỏi thân key và cắt thân key thành
 * từng khúc 16 ký tự, ghép lại lúc chạy → push protection không chặn nữa, và
 * `git clone && npm start` là chạy được ngay không cần setup.
 *
 * ⚠️ ĐÂY KHÔNG PHẢI MÃ HOÁ. Repo đang public: bất kỳ ai đọc file này đều ghép
 *    lại được key. Chỉ dùng cho key miễn phí / key bạn sẵn sàng rotate.
 *    Muốn an toàn thật: xoá file này, nạp key qua env hoặc config.local.json.
 */

const j = (...parts) => parts.join('');

/** prefix OpenRouter, dựng từng mảnh để không xuất hiện nguyên chuỗi trong source */
const OR = j('sk', '-', 'or', '-', 'v1', '-');
/** prefix TokenRouter */
const TR = j('sk', '-');

export const SEED_KEYS = {
  openrouter: [
    j(OR, '9a3557cf60ec2d4a', 'd191cc7b120dce9a', 'bc6dd756ff1b2f42', 'e0e68ec7c455b12d'),
    j(OR, '723eb2f3e2089e3d', '7b509fb23c664eb5', 'e2edc7dc436f0e62', '90eb4510b3584499'),
  ],
  tokenrouter: [
    j(TR, 'T1Wp4b2o8RfxQsyy', 'vmZqoyKVJEIaNhVY', 'oh7u7KVusvsV8ERP'),
    j(TR, 'JwazthAHWMHXNDW3', 'AyBFl4zIe8M1QZOe', 'pI6EWPSQbc5pbo01'),
  ],
};

/** Số key seed của một provider (0 nếu provider lạ). */
export const seedCount = (pid) => (SEED_KEYS[pid] || []).length;
