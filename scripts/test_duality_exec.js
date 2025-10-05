const d = require('../modes/duality');
(async () => {
  try {
    console.log('parse test ->', d.parseTaskAnalysisResponse(JSON.stringify({ needsSubtasks: true, subtasks: [{displayText:'A', objectivePrompt:'do A', expectationResults:'should do A', done:false}]})));
    const mockRouter = {
      runMode: async (modeId, ctx) => {
        console.log('mockRouter.runMode called', modeId, ctx.modelId);
        return { text: 'performed by secondary', raw: 'performed by secondary', user_text: 'performed by secondary' };
      },
      sendPrompt: async (m, p) => ({ text: 'fallback', raw: 'fallback' }),
    };
    const sub = { displayText: 'A', objectivePrompt: 'do A', expectationResults: 'should do A', done: false };
    const res = await d.executeSubtask(sub, 'secondary-model', mockRouter, 'req-test', process.cwd(), null);
    console.log('exec subtask result ->', res);
    // Explicit success exit for CI/terminal clarity
    process.exit(0);
  } catch (err) {
    console.error('Test failed', err);
    process.exit(1);
  }
})();
