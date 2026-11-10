import { SecretVault } from './parser/secrets.js';
import { buildEnvironment } from './parser/build.js';
import { buildComparison } from './parser/compare.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const state = {
  environments: [],
  result: null,
  vault: new SecretVault(),
};

function assertFileSize(name, size) {
  if (size > MAX_FILE_BYTES) {
    throw new Error(`"${name}" is larger than the 25 MB per-file limit.`);
  }
}

async function readFiles(environment) {
  const files = [];
  for (const item of environment.files || []) {
    if (typeof item.text === 'string') {
      assertFileSize(item.name, item.text.length);
      files.push({ name: item.name, fileName: item.name, text: item.text });
      continue;
    }
    if (item.file && typeof item.file.text === 'function') {
      assertFileSize(item.name, item.file.size || 0);
      files.push({ name: item.name, fileName: item.name, text: await item.file.text() });
    }
  }
  return files;
}

async function analyze(message) {
  state.vault.clear();
  state.environments = [];

  try {
    for (const environment of message.environments || []) {
      const files = await readFiles(environment);
      state.environments.push(
        buildEnvironment(
          { id: environment.id, name: environment.name },
          files,
          state.vault,
        ),
      );
    }
  } finally {
    // The models hold only opaque secret tokens by this point.
    state.vault.clear();
  }

  state.result = buildComparison(state.environments, {
    emptyAsAbsent: message.emptyAsAbsent !== false,
  });

  self.postMessage({ type: 'result', result: state.result });
}

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === 'analyze') {
      await analyze(message);
      return;
    }

    if (message.type === 'recompare') {
      state.result = buildComparison(state.environments, {
        emptyAsAbsent: message.emptyAsAbsent !== false,
      });
      self.postMessage({ type: 'result', result: state.result });
      return;
    }

    if (message.type === 'reset') {
      state.environments = [];
      state.result = null;
      state.vault.clear();
      self.postMessage({ type: 'reset-ok' });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error),
    });
  }
};
