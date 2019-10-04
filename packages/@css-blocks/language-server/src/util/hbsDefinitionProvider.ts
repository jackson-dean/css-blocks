import { BlockFactory } from "@css-blocks/core/dist/src";
import * as fs from "fs";
import { Definition, Position, TextDocument } from "vscode-languageserver";
import { URI } from "vscode-uri";

import { getItemAtCursor } from "./hbsUtils";
import { transformPathsFromUri } from "./pathTransformer";

export async function getHbsDefinition(document: TextDocument, position: Position, blockFactory: BlockFactory): Promise<Definition> {
  let transformedPaths = transformPathsFromUri(document.uri);
  let { blockFsPath } = transformedPaths;

  if (!blockFsPath) {
    return [];
  }

  let block = await blockFactory.getBlockFromPath(blockFsPath);
  let blockUri;
  let blockDocumentText;
  let itemAtCursor = getItemAtCursor(document.getText(), position);

  if (itemAtCursor && itemAtCursor.referencedBlock) {
    let referencedBlock = block.getReferencedBlock(itemAtCursor.referencedBlock);
    if (referencedBlock) {
      blockUri = URI.file(referencedBlock.identifier).toString();
      blockDocumentText = fs.readFileSync(referencedBlock.identifier, {
        encoding: "utf8",
      });
    }
  } else {
    blockUri = URI.file(block.identifier).toString();
    blockDocumentText = fs.readFileSync(block.identifier, {
      encoding: "utf8",
    });
  }

  if (blockDocumentText) {
    let lines = blockDocumentText.split(/\r?\n/);
    let selectorPositionLine = 0;

    for (let i = 0; i < lines.length; i++) {
      if (new RegExp((itemAtCursor && itemAtCursor.className) || "").test(lines[i])) {
        selectorPositionLine = i;
        break;
      }
    }

    return !blockUri ? [] : {
      uri: blockUri,
      range: {
        start: {
          line: selectorPositionLine,
          character: 1,
        },
        end: {
          line: selectorPositionLine,
          character: 1,
        },
      },
    };
  }

  return [];
}
