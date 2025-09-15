// Ask mode: simple 1:1 conversation mapping. Exports an object with an execute function
// that receives { router, modelId, prompt, requestId } and returns { text, raw }.

const id = 'ask';
const name = 'Ask';

async function execute({ router, modelId, prompt, requestId }) {
  // provider: 'gemini' | 'nvidia' or null -> router will decide
  // prompt: string or array
  // This function performs the basic send/receive.
  if (!router) throw new Error('Router is required for ask mode');

  // allow procedure hooks: if prompt contains a `do:` token, parse and attempt to run a procedure.
  let procedureResult = null;
  try {
    if (typeof prompt === 'string' && prompt.includes('do:')) {
      // syntax: "<message> do:<procedureName>"
      const parts = prompt.split(/do:\s*/i);
      prompt = parts[0].trim();
      const procName = parts[1] ? parts[1].trim() : null;
      if (procName) {
        // attempt to call a procedure if exposed by router (optional)
        if (router && typeof router.runProcedure === 'function') {
          try {
            procedureResult = await router.runProcedure(procName, { prompt, modelId, requestId });
          } catch (e) {
            procedureResult = { error: String(e) };
          }
        } else {
          procedureResult = { note: 'No router procedure handler registered' };
        }
      }
    }
  } catch (e) {
    console.error('Error parsing procedure:', e);
  }

  // send prompt through the router; router decides provider-specific call
  const resp = await router.sendPrompt(modelId, prompt);

  // include procedure result in returned raw if present
  const text = resp && resp.text ? resp.text : (resp && resp.raw ? JSON.stringify(resp.raw) : '');
  const raw = { resp, procedureResult };
  return { text, raw };
}

module.exports = { id, name, execute };
