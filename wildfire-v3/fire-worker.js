'use strict';
importScripts('fire-model.js');
self.onmessage = event => {
  const message = event.data;
  if (!message || message.type !== 'run') return;
  try {
    const scenario = self.WildfireSimulationModel.createScenario(message.input);
    self.postMessage({ type: 'result', requestId: message.requestId, scenario });
  } catch (error) {
    self.postMessage({ type: 'error', requestId: message.requestId, error: error?.message || 'Simulation failed' });
  }
};
