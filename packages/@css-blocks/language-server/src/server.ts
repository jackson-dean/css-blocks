import {
  // Attribute,
  // Block,
  // BlockClass,
  Block,
  // Options,
  // isBlockClass,
  BlockFactory,
  CssBlockError,
  // errorHasRange,
  Syntax,
  resolveConfiguration,
} from "@css-blocks/core";
import { BlockParser } from "@css-blocks/core/dist/src/BlockParser/BlockParser";
import { preprocess } from "@glimmer/syntax";
import * as fs from "fs";
import { postcss } from "opticss";
import * as path from "path";
import {
  CompletionItem,
  CompletionItemKind,
  // TextDocument,
  // Diagnostic,
  // DiagnosticSeverity,
  Definition,
  DidChangeConfigurationNotification,
  InitializeParams,
  Position,
  ProposedFeatures,
  TextDocument,
  TextDocumentPositionParams,
  TextDocuments,
  createConnection,
  // TextDocumentSyncKind,
  // DidChangeTextDocumentParams,
  // Range
} from "vscode-languageserver";
import { URI } from "vscode-uri";

import { DiagnosticsManager } from "./services/diagnostics";
import { toPosition } from "./util/estTreeUtils";
import { ASTPath } from "./util/glimmerUtils";
import { hbsErrorParser } from "./util/hbsErrorParser";

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);
const diagnostics = new DiagnosticsManager(connection);

// Initialize simple documents manager
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
// let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we will fall back using global settings
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  // hasDiagnosticRelatedInformationCapability = !!(
  //   capabilities.textDocument &&
  //   capabilities.textDocument.publishDiagnostics &&
  //   capabilities.textDocument.publishDiagnostics.relatedInformation
  // );

  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      definitionProvider: true,
      // TODO: implement support for this for showing documentation
      // hoverProvider: true,
      documentSymbolProvider: false,
      completionProvider: {
        resolveProvider: true,
      },
    },
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined,
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
// let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(_change => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    // globalSettings = <ExampleSettings>(
    //   (change.settings.cssBlocksLanguageServer || defaultSettings)
    // );
  }

  // Revalidate all open text documents
  // documents.all().forEach(validateDocument);
});

// function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
//   if (!hasConfigurationCapability) {
//     return Promise.resolve(globalSettings);
//   }
//   let result = documentSettings.get(resource);
//   if (!result) {
//     result = connection.workspace.getConfiguration({
//       scopeUri: resource,
//       section: "cssBlocksLanguageServer"
//     });
//     documentSettings.set(resource, result);
//   }
//   return result;
// }

// Only keep settings for open documents
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted when the
// text document is first opened or when its content has changed. When the document
// is opened we receive the full text. On subsequent edits we only get the
// changed text.
const config = resolveConfiguration({});
const factory = new BlockFactory(config, postcss);
const parser = new BlockParser(config, factory);

function isBlockFile(uri: string) {
  return uri.endsWith(".block.css");
}

function isTemplateFile(uri: string) {
  return uri.endsWith(".hbs");
}

class PathTranslator {
  templateFsPath?: string;
  templateUri?: string;
  blockFsPath?: string;
  blockUri?: string;

  constructor(uri: string) {
    let fsPath = URI.parse(uri).fsPath;

    if (fsPath.endsWith(".hbs")) {
      this.templateFsPath = fsPath;
      this.templateUri = uri;
      this.blockFsPath = fsPath
        .replace(/.hbs$/, ".block.css")
        .replace(
          new RegExp(`${path.sep}templates${path.sep}`),
          `${path.sep}styles${path.sep}`,
        );
      this.blockUri = URI.file(this.blockFsPath).toString();
    }

    if (isBlockFile(uri)) {
      this.blockFsPath = fsPath;
      this.blockUri = uri;
      this.templateFsPath = fsPath
        .replace(/\.block\.css$/, ".hbs")
        .replace(
          new RegExp(`${path.sep}styles${path.sep}`),
          `${path.sep}templates${path.sep}`,
        );
      this.templateUri = URI.file(this.templateFsPath).toString();
    }
  }
}

async function validateTemplate(uri: string) {
  const { blockFsPath, templateUri } = new PathTranslator(uri);

  if (blockFsPath && templateUri) {
    try {
      let block = await factory.getBlockFromPath(blockFsPath);
      let document = documents.get(templateUri);

      if (document) {
        let documentText = document.getText();
        let errors = hbsErrorParser(documentText, block);
        await diagnostics.sendDiagnostics(errors, templateUri);
      }
    } catch (e) {
      // TODO: use a toast to notify of parsing error?
      connection.console.warn(e);
    }
  }
}

function getClassPartsNameAtCursorPosition(
  document: TextDocument,
  position: Position,
): string[] {
  let text = document.getText();
  let ast = preprocess(text);
  let focusedNode = ASTPath.toPosition(ast, toPosition(position));

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
      return selectedText.split(".");
    }
  }

  return [];
}

documents.onDidSave(async e => {
  factory.reset();
  await validateTemplate(e.document.uri);
});

documents.onDidChangeContent(async e => {
  const { uri } = e.document;

  if (!isBlockFile(uri)) {
    return;
  }

  const { fsPath } = URI.parse(uri);
  const text = e.document.getText();

  try {
    await parser.parseSource({
      identifier: fsPath,
      defaultName: path.parse(fsPath).name.replace(/\.block/, ""),
      originalSource: text,
      originalSyntax: Syntax.css,
      parseResult: postcss.parse(text, { from: fsPath }),
      dependencies: [],
    });
    // clear the errors if nothing is wrong
    await diagnostics.sendDiagnostics([], uri);
  } catch (e) {
    if (e instanceof CssBlockError) {
      await diagnostics.sendDiagnostics([e], uri);
    }
  }
});

connection.onDefinition(
  async (params: TextDocumentPositionParams): Promise<Definition> => {
    let {
      position,
      textDocument: { uri },
    } = params;
    let pathTranslator = new PathTranslator(uri);
    let document = documents.get(uri);

    if (document) {
      if (
        isTemplateFile(uri) &&
        pathTranslator.blockUri &&
        pathTranslator.blockFsPath
      ) {
        let classNameParts = getClassPartsNameAtCursorPosition(
          document,
          position,
        );
        let hasBlockReference = classNameParts.length > 1;
        let block = await factory.getBlockFromPath(pathTranslator.blockFsPath);
        let className = hasBlockReference ? classNameParts[1] : classNameParts[0];
        let blockUri = pathTranslator.blockUri;
        let blockDocumentText;

        if (hasBlockReference) {
          let referencedBlock = block.getReferencedBlock(classNameParts[0]);
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

          lines.forEach((line, i) => {
            if (new RegExp(className).test(line)) {
              selectorPositionLine = i;
            }
          });

          return {
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

      }
    }

    return [];
  },
);

// connection.onHover((params: TextDocumentPositionParams): Hover | undefined => {
//   // TODO: show documentation if it exists
//   return;
// });

connection.onCompletion(
  async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
      // TODO: figure out why this is not working and use it instead of the
      // following replace hack
      // const filepath = url.fileURLToPath(uri);
      const filepath = document.uri.replace(/^file:\/\//, "");
      // const filepath = url.fileURLToPath(document.uri);
      const extension = filepath.split(".").pop();

      switch (extension) {
        case "hbs":
          const blockPath = filepath
            .replace(/.hbs$/, ".block.css")
            .replace(
              new RegExp(`${path.sep}templates${path.sep}`),
              `${path.sep}styles${path.sep}`,
            );

          try {
            let block: Block | null;
            block = await factory.getBlockFromPath(blockPath);
            let classNameParts = getClassPartsNameAtCursorPosition(document, params.position);
            let hasBlockReference = classNameParts.length > 1;

            if (hasBlockReference && block) {
              block = block.getReferencedBlock(classNameParts[0]);
            }

            if (block === null) {
              return [];
            }

            const attributes = block.rootClass.getAttributes();
            let completions = attributes.map(
              (attr): CompletionItem => ({
                label: `${attr.namespace}:${attr.name}`,
                kind: CompletionItemKind.Property,
              }),
            );

            block.classes
              // TODO: we should look at scope attributes if the user is on the
              // root element.
              .filter(blockClass => !blockClass.isRoot)
              .forEach(blockClass => {
                const classCompletion: CompletionItem = {
                  label: blockClass.name,
                  kind: CompletionItemKind.Property,
                };

                const classAttributeCompletions = blockClass
                  .getAttributes()
                  .map(
                    (attr): CompletionItem => ({
                      label: `${attr.namespace}:${attr.name}`,
                      kind: CompletionItemKind.Property,
                    }),
                  );

                completions = completions.concat(
                  classCompletion,
                  classAttributeCompletions,
                );
              });

            // TODO: we can make this smarter by inspecting the
            // glimmer/handlebars ast to see what completions make sense. Right
            // now we are just returning everything from the block file and its
            // imports.
            return completions;
          } catch (e) {
            return [];
          }
        default:
          return [];
      }
    }

    return [];
  },
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
      item.detail = "TypeScript details";
      item.documentation = "TypeScript documentation";
    } else if (item.data === 2) {
      item.detail = "JavaScript details";
      item.documentation = "JavaScript documentation";
    }
    return item;
  },
);

connection.onDidChangeWatchedFiles(_change => {
  // Monitored files have change in VSCode
  connection.console.log("We received an file change event");
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
