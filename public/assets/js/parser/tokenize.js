const SECTION_OPEN = /^\s*<([A-Za-z0-9_-]+)>(.*)$/;
const SECTION_CLOSE = /^\s*<\/([A-Za-z0-9_-]+)>\s*$/;

export function normalizeText(text) {
  return String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
}

export function splitSections(text, fileName = '') {
  const normalized = normalizeText(text);
  const lines = normalized.split('\n');
  const sections = [];
  const errors = [];
  const preamble = [];
  let current = null;

  function finish(closed) {
    if (!current) return;
    current.closed = closed;
    current.endLine = current.startLine + Math.max(0, current.lines.length);
    sections.push(current);
    current = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const closeMatch = line.match(SECTION_CLOSE);

    if (closeMatch) {
      if (current && current.name === closeMatch[1]) {
        finish(true);
      } else {
        errors.push({
          fileName,
          line: index + 1,
          message: `Unexpected closing tag </${closeMatch[1]}>`,
        });
      }
      continue;
    }

    const openMatch = line.match(SECTION_OPEN);
    if (openMatch) {
      if (current) {
        if (current.name !== 'HEADER') {
          errors.push({
            fileName,
            line: current.startLine,
            message: `Section <${current.name}> was not closed before <${openMatch[1]}>`,
          });
        }
        finish(false);
      }

      const trailing = openMatch[2].trim();
      current = {
        name: openMatch[1],
        baseName: openMatch[1].replace(/-\d+$/, ''),
        suffix: (openMatch[1].match(/-(\d+)$/) || [])[1] || null,
        startLine: index + 1,
        lines: [],
        headerValue: trailing || '',
        closed: false,
      };
      continue;
    }

    if (current) {
      current.lines.push({ text: line, line: index + 1 });
    } else {
      preamble.push({ text: line, line: index + 1 });
    }
  }

  if (current) {
    if (current.name !== 'HEADER') {
      errors.push({
        fileName,
        line: current.startLine,
        message: `Section <${current.name}> is not closed`,
      });
    }
    finish(false);
  }

  return { sections, errors, preamble, lineCount: lines.length };
}

export function isComment(line) {
  return /^\s*[#;]/.test(line);
}

export function isBlank(line) {
  return /^\s*$/.test(line);
}

export function contentLines(section) {
  return section.lines
    .map((line) => line.text)
    .filter((line) => !isBlank(line) && !isComment(line));
}

export function lineNumberAt(section, offset) {
  const line = section.lines[offset];
  return line ? line.line : section.startLine;
}
