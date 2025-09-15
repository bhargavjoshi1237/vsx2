// For now we register modes statically. This loader makes it easy to expand later.
const ask = require('./ask');

const MODES = [ask];

function listModes() {
  return MODES.map(m => ({ id: m.id, name: m.name }));
}

function getModeById(id) {
  return MODES.find(m => m.id === id) || null;
}

module.exports = {
  listModes,
  getModeById
};
