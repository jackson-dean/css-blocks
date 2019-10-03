import { Block, CssBlockError, SourceRange } from "@css-blocks/core/dist/src";

interface CSSClassPosition {
  className: string;
  range: SourceRange;
}

// TODO: convert to use glimmer
export function hbsErrorParser(documentText: string, block: Block): CssBlockError[] {
  let classes: CSSClassPosition[] = [];
  let regex = /class=('|")([^"']*)\1/g;
  let match: RegExpExecArray | null;
  const lines = documentText.split(/\r?\n/);

  lines.forEach((line, index) => {
    while ((match = regex.exec(line))) {
      let previousClassName = "";
      let matchIndexOffset = 8;

      match[2].split(/\s+/).forEach(className => {
        if (match === null) {
          return;
        }

        matchIndexOffset += previousClassName
          ? previousClassName.length + 1
          : 0;

        classes.push({
          className,
          range: {
            start: {
              line: index + 1,
              column: match.index + matchIndexOffset,
            },
            end: {
              line: index + 1,
              column: match.index + matchIndexOffset + className.length - 1,
            },
          },
        });

        previousClassName = className;
      });
    }
  });

  let errors: CssBlockError[] = [];
  classes.forEach(obj => {
    try {
      const blockName = obj.className.includes(".")
        ? obj.className
        : `.${obj.className}`;
      block.lookup(blockName, obj.range);
    } catch (error) {
      errors.push(error);
    }
  });

  return errors;
}
