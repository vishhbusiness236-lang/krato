// scripts/analyze.js
// Usage: node scripts/analyze.js

require('dotenv').config();
const fs = require('fs');

async function main() {
  if (!fs.existsSync('scan-report.json')) {
    console.error('❌ scan-report.json nahi mila. Pehle crawl.js chalao.');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync('scan-report.json', 'utf-8'));

  const prompt = `
Tum ek QA expert ho jo ek website scan report analyze kar rahe ho.
Yeh raha scan data:

URL: ${report.url}
Buttons found: ${report.elementsFound.buttons.length} (${JSON.stringify(report.elementsFound.buttons)})
Links found: ${report.elementsFound.links.length}
Forms found: ${report.elementsFound.formsCount}
Inputs found: ${report.elementsFound.inputsCount}
Console errors: ${JSON.stringify(report.consoleErrors)}
Network errors: ${JSON.stringify(report.networkErrors)}

Is data ke basis pe:
1. Explain in clear, professional English what issues might exist on this page
2. Agar koi console/network error hai, uska plain-language explanation do (kyun aaya, kya matlab hai)
3. Agar buttons/forms bahut kam mile (jaise 0), to bolo ki content shayad JS se dynamically load ho raha hai, isliye scanner ko wait karna chahiye
4. Ek short priority list do: "sabse pehle ye fix karo"

Sirf actionable, concise report do. Extra fluff mat likho.
`;

  console.log('🤖 Analyzing report with AI...\n');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  const data = await response.json();

  if (data.error) {
    console.error('❌ Groq API error:', data.error.message);
    process.exit(1);
  }

  const analysis = data.choices[0].message.content;

  console.log('========== AI ANALYSIS ==========\n');
  console.log(analysis);

  fs.writeFileSync('analysis-report.md', analysis);
  console.log('\n📄 Saved to analysis-report.md');
}

main();