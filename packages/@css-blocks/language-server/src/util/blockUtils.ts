import { CssBlockError, Syntax } from "@css-blocks/core/dist/src";
import { postcss } from "opticss";
import * as path from "path";

import { blockParser } from "../blockParser";

export function isBlockFile(uriOrFsPath: string) {
  return uriOrFsPath.endsWith(".block.css") || uriOrFsPath.endsWith("block.scss");
}

export async function parseBlockErrors(blockFsPath: string, sourceText: string): Promise<CssBlockError[]> {
  let errors: CssBlockError[] = [];

  try {
    await blockParser.parseSource({
      identifier: blockFsPath,
      defaultName: path.parse(blockFsPath).name.replace(/\.block/, ""),
      originalSource: sourceText,
      originalSyntax: Syntax.css,
      parseResult: postcss.parse(sourceText, { from: blockFsPath }),
      dependencies: [],
    });
  } catch (error) {
    if (error instanceof CssBlockError) {
      errors = errors.concat(error);
    }
  }

  return errors;
}
