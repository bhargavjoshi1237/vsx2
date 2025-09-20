const legacy = require('../modes/legacy');

async function run() {
  const fakeRouter = {
    sendPrompt: async (modelId, prompt, modeId) => {
      // Simulate provider returning raw string that is JSON
      return { raw: JSON.stringify({ user_text: 'Hi there', other: '' }) };
    }
  };

  const res = await legacy.execute({ router: fakeRouter, modelId: 'test', prompt: 'hello' });
  console.log('Legacy execute returned:');
  console.log(res);
}

run().catch(err => { console.error('Err', err); process.exit(1); });
