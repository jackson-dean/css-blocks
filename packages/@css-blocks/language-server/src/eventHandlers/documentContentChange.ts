import { CssBlockError } from "@css-blocks/core/dist/src";
import { TextDocumentChangeEvent } from "vscode-languageserver";
import { URI } from "vscode-uri";

import { isBlockFile, parseBlockErrors } from "../util/blockUtils";

export async function documentContentChange(e: TextDocumentChangeEvent): Promise<CssBlockError[]> {
  const { uri } = e.document;

  if (isBlockFile(uri)) {
    return await parseBlockErrors(URI.parse(uri).fsPath, e.document.getText());
  }

  return [];
}
