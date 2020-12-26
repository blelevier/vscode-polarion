// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// import { Polarion } from "./polarion";
import * as pol from './polarion';
import { PolarionStatus } from "./status";
import { PolarionOutlinesProvider } from './polarionoutline';
import * as utils from './utils';

const open = require('open');



let polarionStatus: PolarionStatus;
let outputChannel: vscode.OutputChannel;

let outlineProvider: any;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

  outlineProvider = new PolarionOutlinesProvider(vscode.workspace.workspaceFolders);

  outputChannel = vscode.window.createOutputChannel("Polarion");

  let polarionStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  polarionStatusBar.tooltip = "Clear to clear cached work items";
  polarionStatusBar.command = "vscode-polarion.clearCache";
  context.subscriptions.push(polarionStatusBar);

  polarionStatus = new PolarionStatus(polarionStatusBar);

  polarionStatus.update(pol.polarion);

  utils.checkSettings();

  pol.createPolarion(outputChannel).finally(() => { polarionStatus.update(pol.polarion); });

  let disposable = vscode.commands.registerCommand('vscode-polarion.clearCache', () => {
    if (pol.polarion) {
      pol.polarion.clearCache();
    }
    vscode.window.showInformationMessage('Cleared polarion work item cache');
  });

  context.subscriptions.push(disposable);

  disposable = vscode.commands.registerCommand('vscode-polarion.openPolarion', async () => {
    await handleOpenPolarion();
  });

  context.subscriptions.push(disposable);

  vscode.workspace.onWillSaveTextDocument(event => {
    const openEditor = vscode.window.visibleTextEditors.filter(
      editor => editor.document.uri === event.document.uri
    )[0];
    if (openEditor) {
      outlineProvider.refresh();
      decorate(openEditor);
    }
  });

  vscode.window.onDidChangeActiveTextEditor(event => {
    if (event) {
      outlineProvider.refresh();
      decorate(event);
    }
  });

  vscode.workspace.onDidChangeConfiguration(event => {
    let configChange = event.affectsConfiguration('Polarion');

    if (configChange) {
      utils.checkSettings();

      pol.createPolarion(outputChannel).finally(() => { polarionStatus.update(pol.polarion); });
    }
  });

  vscode.window.registerTreeDataProvider('polarionOutline', outlineProvider);


}

// this method is called when your extension is deactivated
export function deactivate() { }


const decorationType = vscode.window.createTextEditorDecorationType({});

async function decorate(editor: vscode.TextEditor) {
  polarionStatus.startUpdate(pol.polarion);
  let decorationColor = utils.getDecorateColor();
  let enableHover: boolean | undefined = vscode.workspace.getConfiguration('Polarion', null).get('Hover');
  let decorationsArray: vscode.DecorationOptions[] = [];

  let items = utils.mapItemsInDocument(editor);

  for (const item of items) {
    var title = await getWorkItemText(item[0]);
    let renderOptionsDark = { after: { contentText: title, color: decorationColor, margin: '50px' } };
    let renderOptions = { light: renderOptionsDark, dark: renderOptionsDark };

    for (const itemRange of item[1]) {
      let hoverMessage = await buildHoverMarkdown(item[0]);
      if (enableHover === true) {
        let range = new vscode.Range(itemRange.start.line, itemRange.start.character, itemRange.end.line, itemRange.end.character - 1); // rebuild range to remove last character
        let onItemDecoration = { range, hoverMessage };
        decorationsArray.push(onItemDecoration);
        range = new vscode.Range(itemRange.start.line, 200, itemRange.end.line, 201);
        let afterLineDecoration = { range, renderOptions, hoverMessage };
        decorationsArray.push(afterLineDecoration);
      }
      else {
        let range = new vscode.Range(itemRange.start.line, 200, itemRange.end.line, 201);
        let afterLineDecoration = { range, renderOptions };
        decorationsArray.push(afterLineDecoration);
      }
    }
  }
  editor.setDecorations(decorationType, decorationsArray);
  polarionStatus.endUpdate();
}

async function buildHoverMarkdown(workItem: string): Promise<string[]> {
  let item = await pol.polarion.getWorkItem(workItem);
  let url = await pol.polarion.getUrlFromWorkItem(workItem);
  let hover: string[] = [];
  if (item !== undefined) {
    hover.push(`${workItem} (${item.type.id}) ***${item.title}***  \nAuthor: ${item.author.id}  \n Status: ${item.status.id}`);
    if (item.description) {
      hover.push(`${item.description?.content}`);
    }
    hover.push(`[Open in Polarion](${url})`);
  }
  else {
    hover.push(`Not found`);
  }
  return hover;
}

async function handleOpenPolarion() {
  const editor = vscode.window.activeTextEditor;
  if (editor !== undefined) {
    if (editor.selection.isEmpty) {
      // the Position object gives you the line and character where the cursor is
      const position = editor.selection.active;

      let items = utils.listItemsInDocument(editor);

      let selectedItem = items.find((value) => {
        if (value.range.contains(position)) {
          return 1;
        }
      });

      if (selectedItem) {
        open(await pol.polarion.getUrlFromWorkItem(selectedItem.name));
      }
    }
  }
}

async function getWorkItemText(workItem: string): Promise<string> {
  var workItemText = 'Not found in polarion';
  await pol.polarion.getTitleFromWorkItem(workItem).then((title: string | undefined) => {
    if (title !== undefined) {
      workItemText = workItem + ': ' + title;
    }
  });

  return workItemText;
}



