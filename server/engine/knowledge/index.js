import react from './react.js';
import node from './node.js';
import fullstack from './fullstack.js';
import auth from './auth.js';
import uicss from './uicss.js';
import algorithms from './algorithms.js';
import debug from './debug.js';
import refactor from './refactor.js';
import deploy from './deploy.js';
import database from './database.js';
import typescript from './typescript.js';
import forms from './form.js';
import state from './state.js';
import general from './general.js';
import { F } from './markup.js';
import { detectExtension } from './extensions.js';

const extendDoc = {
  id: 'extend',
  title: 'Extend code',
  keywords: ['thêm', 'bổ sung', 'cập nhật', 'sửa'],
  boost: {},
  corpus: 'bổ sung tính năng vào code đã sinh: dark mode, test, loading, i18n, error handling, validation, animation, pagination',
  render(ctx) {
    const topic = ctx.userText;
    const ext = ctx.ext || detectExtension(topic);

    if (!ext) {
      const thought =
        'Yêu cầu: "' + topic + '". → Intent: bổ sung tính năng vào code vừa sinh. Chưa có patch mẫu sẵn cho chủ đề này — ' +
        'mình trả về pattern chung + hỏi rõ để sinh đúng.';
      const answer =
        '# 🔧 Bổ sung tính năng\n\n' +
        'Mình hiểu bạn muốn thêm **"' + topic + '"** vào code ở trên. Chốt giúp mình 1 trong 2 để làm chuẩn:\n\n' +
        '1. **Tên file/component** sẽ bổ sung (ví dụ ' + 'src/components/' + ctx.name + '.jsx' + ')\n' +
        '2. **Yêu cầu cụ thể** — hành vi mong muốn, ví dụ UI, dữ liệu mẫu\n\n' +
        'Hoặc nói thẳng "làm theo cách gọn nhất" — mình sẽ chọn phương án đơn giản nhất, ' +
        'thêm code ngay vào file hiện có, không đổi kiến trúc đã chốt.';
      return { thought, answer };
    }

    const { snippet, note, file } = ext.render(ctx);
    const lang = file.endsWith('.css') ? 'css' : file.endsWith('.js') ? 'js' : 'jsx';
    const thought =
      'Yêu cầu: "' + topic + '". → Intent: extend code đã sinh. Match được patch mẫu **' + ext.title + '**. ' +
      'Nguyên tắc: thêm TỪNG ĐỘC LẬP vào code hiện có (không viết lại), giữ API cũ, ' +
      'kèm note cài đặt nếu cần dependency mới.';
    const answer =
      '# 🔧 Thêm ' + ext.title + '\n\n' +
      'Patch cộng gộp — thả thẳng vào dự án ở trên, không đụng code đã có:\n\n' +
      F(lang, file, snippet) +
      (note ? '**Setup nhanh:**\n\n' + F('bash', 'terminal', note) + '\n' : '') +
      '> ✅ Đã khớp với code ' + ctx.name + ' từ tin trước. Nếu file tên khác, chỉ cần đổi đường dẫn import.';
    return { thought, answer };
  },
};

const ALL = [
  ...react,
  ...node,
  ...fullstack,
  ...auth,
  ...uicss,
  ...algorithms,
  ...debug,
  ...refactor,
  ...deploy,
  ...database,
  ...typescript,
  ...forms,
  ...state,
  ...general,
  extendDoc,
];

export const DOCS_BY_ID = Object.fromEntries(ALL.map((d) => [d.id, d]));
export default ALL;
