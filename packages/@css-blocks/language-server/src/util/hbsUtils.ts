import {
  Block,
  BlockFactory,
  CssBlockError,
  SourceRange,
} from "@css-blocks/core/dist/src";
import { preprocess } from "@glimmer/syntax";
import { ElementNode, TextNode } from "@glimmer/syntax/dist/types/lib/types/nodes";
import { Position, TextDocuments } from "vscode-languageserver";

import { GlimmerAstPath } from "../GlimmerAstPath";

import { toPosition } from "./estTreeUtils";
import { transformPathsFromUri } from "./pathTransformer";

interface CSSClassPosition {
  className: string;
  range: SourceRange;
}

// TODO: convert to use glimmer
export function hbsErrorParser(
  documentText: string,
  block: Block,
): CssBlockError[] {
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

export function isTemplateFile(uri: string) {
  return uri.endsWith(".hbs");
}

interface ErrorsForUri {
  uri: string;
  errors: CssBlockError[];
}

export async function validateTemplates(
  documents: TextDocuments,
  factory: BlockFactory,
): Promise<Map<string, CssBlockError[]>> {
  let openTextDocuments = documents
    .all()
    .filter(doc => isTemplateFile(doc.uri));

  let errorsForUri: (ErrorsForUri | null)[] = await Promise.all(
    openTextDocuments.map(
      async (document): Promise<ErrorsForUri | null> => {
        const { blockFsPath, templateUri } = transformPathsFromUri(
          document.uri,
        );
        if (blockFsPath && templateUri) {
          try {
            let block = await factory.getBlockFromPath(blockFsPath);
            let documentText = document.getText();
            let errors = hbsErrorParser(documentText, block);

            return {
              uri: templateUri,
              errors,
            };
          } catch (e) {
            // TODO: we need to do *something* about this
          }
        }
        return null;
      },
    ),
  );

  return errorsForUri.reduce((result, uriWithErrors) => {
    if (uriWithErrors) {
      result.set(uriWithErrors.uri, uriWithErrors.errors);
    }
    return result;
  },                         new Map());
}

interface BlockSegments {
  referencedBlock?: string;
  className?: string;
}

interface ItemAtCursor extends BlockSegments {
  parentType: string;
  siblingBlocks?: BlockSegments[];
}

export function getItemAtCursor(text: string, position: Position): ItemAtCursor | null {
  let ast = preprocess(text);
  let focusedNode = GlimmerAstPath.toPosition(ast, toPosition(position));

  if (
    focusedNode &&
    focusedNode.parent &&
    focusedNode.parent.type === "AttrNode" &&
    focusedNode.parent.name === "state" &&
    focusedNode.parentPath &&
    focusedNode.parentPath.parent
  ) {
    let parentNode = focusedNode.parentPath.parent as ElementNode;
    let classAttrNode = parentNode.attributes.find(attrNode => attrNode.name === "class");
    if (classAttrNode) {
      let siblingBlocks: BlockSegments[] = (classAttrNode.value as TextNode).chars.split(/\s+/).map(className => {
        let segments = className.split(".");

        if (segments.length > 1) {
          return {
            referencedBlock: segments[0],
            className: segments[1],
          };
        }

        return {
          className: segments[0],
        };
      });

      return {
        parentType: "state",
        siblingBlocks: siblingBlocks,
      };
    }
  }

  if (
    focusedNode &&
    focusedNode.parent &&
    focusedNode.parent.type === "AttrNode" &&
    focusedNode.parent.name === "class"
  ) {
    if (focusedNode.node.type === "TextNode") {
      let focusedColumnInNode =
        position.character - focusedNode.node.loc.start.column - 1;
      let textNode = focusedNode.node;
      let classNameString = textNode.chars;
      let suffix = classNameString
        .slice(focusedColumnInNode)
        .split(/\s+/)
        .shift();
      let prefix = classNameString
        .slice(0, focusedColumnInNode)
        .split(/\s+/)
        .reverse()
        .shift();

      let selectedText = `${prefix}${suffix}`;
      let segments = selectedText.split(".");
      let hasBlockReference = segments.length > 1;

      if (hasBlockReference) {
        return {
          referencedBlock: segments[0],
          className: segments[1],
          parentType: "class",
        };
      }

      return {
        className: segments[0],
        parentType: "class",
      };
    }
  }

  return null;
}
