import { BlockFactory, CssBlockError } from "@css-blocks/core/dist/src";
import { CompletionItem, Definition, DidChangeConfigurationNotification, IConnection, InitializeParams, ProposedFeatures, TextDocumentPositionParams, TextDocuments, createConnection } from "vscode-languageserver";

import { blockFactory as cssBlocksFactory } from "./blockFactory";
import { emberCompletionProvider } from "./completionProviders/emberCompletionProvider";
import { emberDefinitionProvider } from "./definitionProviders/emberDefinitionProvider";
import { documentContentChange } from "./eventHandlers/documentContentChange";
import { SERVER_CAPABILITIES } from "./serverCapabilities";
import { convertErrorsToDiagnostics } from "./util/diagnosticsUtils";
import { validateTemplates } from "./util/hbsUtils";

export class Server {
  connection: IConnection;
  documents: TextDocuments;
  blockFactory: BlockFactory;
  hasConfigurationCapability = false;
  hasWorkspaceFolderCapability = false;

  constructor({
    connection = createConnection(ProposedFeatures.all),
    documents = new TextDocuments(),
    blockFactory = cssBlocksFactory,
  } = {}) {
    this.connection = connection;
    this.documents = documents;
    this.blockFactory = blockFactory;

    this.registerDocumentEvents();
    this.registerConnectionEvents();
  }

  listen() {
    this.documents.listen(this.connection);
    this.connection.listen();
  }

  private registerDocumentEvents() {
    this.documents.onDidChangeContent(async (e) => {
      const cssBlockErrors = await documentContentChange(e);
      this.sendDiagnostics(cssBlockErrors, e.document.uri);
    });

    this.documents.onDidSave(async () => {
      this.blockFactory.reset();
      this.distributeDiagnostics(await validateTemplates(this.documents, this.blockFactory));
    });
  }

  // TODO: decide providers based on configuration
  private registerConnectionEvents() {
    this.connection.onInitialize(this.onConnectionInitialize.bind(this));
    this.connection.onInitialized(this.afterConnectionInitialized.bind(this));

    this.connection.onCompletion(async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
      return await emberCompletionProvider(this.documents, this.blockFactory, params);
    });

    this.connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Definition> => {
      return await emberDefinitionProvider(this.documents, this.blockFactory, params);
    });
  }

  private onConnectionInitialize(params: InitializeParams) {
    let capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we will fall back using global settings
    this.hasConfigurationCapability = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    this.hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    return SERVER_CAPABILITIES;
  }

  private afterConnectionInitialized() {
    if (this.hasConfigurationCapability) {
      // Register for all configuration changes.
      this.connection.client.register(
        DidChangeConfigurationNotification.type,
        undefined,
      );
    }
    if (this.hasWorkspaceFolderCapability) {
      this.connection.workspace.onDidChangeWorkspaceFolders(_event => {
        this.connection.console.log("Workspace folder change event received.");
      });
    }
  }

  private distributeDiagnostics(uriToErrorsMap: Map<string, CssBlockError[]>) {
    uriToErrorsMap.forEach(this.sendDiagnostics.bind(this));
  }

  private sendDiagnostics(errors: CssBlockError[], uri: string) {
    this.connection.sendDiagnostics({
      uri,
      diagnostics: convertErrorsToDiagnostics(errors),
    });
  }
}
