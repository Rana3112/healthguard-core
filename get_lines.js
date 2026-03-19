const fs = require('fs');
let code = fs.readFileSync('components/TextChatInterface.tsx', 'utf8');

const s1 = code.indexOf('{msg.suggestedQuestionCards.slice(0, 6).map((card, cardIdx) => (');
const s2 = code.indexOf('))}', s1);

console.log(code.substring(s1, code.indexOf('</div>', code.indexOf('</div>', s1))));
