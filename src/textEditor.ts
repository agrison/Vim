import * as vscode from 'vscode';

import { Position } from './common/motion/position';
import { configuration } from './configuration/configuration';

/**
 * Collection of helper functions around vscode.window.activeTextEditor
 */
export class TextEditor {
  static readonly whitespaceRegExp = new RegExp('^ *$');

  // TODO: Refactor args

  /**
   * Verify that a tab is even open for the TextEditor to act upon.
   *
   * This class was designed assuming there will usually be an active editor
   * to act upon, which is usually true with editor hotkeys.
   *
   * But there are cases where an editor won't be active, such as running
   * code on VSCodeVim activation, where you might see the error:
   * > [Extension Host] Here is the error stack:
   * > TypeError: Cannot read property 'document' of undefined
   */
  static get isActive() {
    return vscode.window.activeTextEditor != null;
  }

  /**
   * @deprecated Use InsertTextTransformation (or InsertTextVSCodeTransformation) instead.
   */
  static async insert(
    text: string,
    at: Position | undefined = undefined,
    letVSCodeHandleKeystrokes: boolean | undefined = undefined
  ): Promise<void> {
    // If we insert "blah(" with default:type, VSCode will insert the closing ).
    // We *probably* don't want that to happen if we're inserting a lot of text.
    if (letVSCodeHandleKeystrokes === undefined) {
      letVSCodeHandleKeystrokes = text.length === 1;
    }

    if (!letVSCodeHandleKeystrokes) {
      // const selections = vscode.window.activeTextEditor!.selections.slice(0);

      await vscode.window.activeTextEditor!.edit((editBuilder) => {
        if (!at) {
          at = Position.FromVSCodePosition(vscode.window.activeTextEditor!.selection.active);
        }

        editBuilder.insert(at!, text);
      });

      // maintain all selections in multi-cursor mode.
      // vscode.window.activeTextEditor!.selections = selections;
    } else {
      await vscode.commands.executeCommand('default:type', { text });
    }
  }

  /**
   * @deprecated Use InsertTextTransformation (or InsertTextVSCodeTransformation) instead.
   */
  static async insertAt(text: string, position: vscode.Position): Promise<boolean> {
    return vscode.window.activeTextEditor!.edit((editBuilder) => {
      editBuilder.insert(position, text);
    });
  }

  /**
   * @deprecated Use DeleteTextTransformation or DeleteTextRangeTransformation instead.
   */
  static async delete(range: vscode.Range): Promise<boolean> {
    return vscode.window.activeTextEditor!.edit((editBuilder) => {
      editBuilder.delete(range);
    });
  }

  static getDocumentVersion(): number {
    return vscode.window.activeTextEditor!.document.version;
  }

  static getDocumentName(): String {
    return vscode.window.activeTextEditor!.document.fileName;
  }

  /**
   * @deprecated. Use ReplaceTextTransformation instead.
   */
  static async replace(range: vscode.Range, text: string): Promise<boolean> {
    return vscode.window.activeTextEditor!.edit((editBuilder) => {
      editBuilder.replace(range, text);
    });
  }

  static readLineAt(lineNo: number): string {
    if (lineNo === null) {
      lineNo = vscode.window.activeTextEditor!.selection.active.line;
    }

    if (lineNo >= vscode.window.activeTextEditor!.document.lineCount) {
      throw new RangeError();
    }

    return vscode.window.activeTextEditor!.document.lineAt(lineNo).text;
  }

  static getLineCount(textEditor?: vscode.TextEditor): number {
    textEditor = textEditor ?? vscode.window.activeTextEditor;
    return textEditor?.document.lineCount ?? -1;
  }

  public static getLineLength(line: number): number {
    if (line < 0 || line > TextEditor.getLineCount()) {
      throw new Error(`getLineLength() called with out-of-bounds line ${line}`);
    }

    return TextEditor.readLineAt(line).length;
  }

  static getLine(lineNumber: number): vscode.TextLine {
    return vscode.window.activeTextEditor!.document.lineAt(lineNumber);
  }

  static getLineAt(position: vscode.Position): vscode.TextLine {
    return vscode.window.activeTextEditor!.document.lineAt(position);
  }

  static getCharAt(position: Position): string {
    const line = TextEditor.getLineAt(position);

    return line.text[position.character];
  }

  static getSelection(): vscode.Range {
    return vscode.window.activeTextEditor!.selection;
  }

  static getText(selection?: vscode.Range): string {
    return vscode.window.activeTextEditor!.document.getText(selection);
  }

  /**
   *  Retrieves the current word at position.
   *  If current position is whitespace, selects the right-closest word
   */
  static getWord(position: Position): string | undefined {
    let start = position;
    let end = position.getRight();

    const char = TextEditor.getText(new vscode.Range(start, end));
    if (this.whitespaceRegExp.test(char)) {
      start = position.getWordRight();
    } else {
      start = position.getWordLeft(true);
    }
    end = start.getCurrentWordEnd(true).getRight();

    const word = TextEditor.getText(new vscode.Range(start, end));

    if (this.whitespaceRegExp.test(word)) {
      return undefined;
    }

    return word;
  }

  static getTabCharacter(editor: vscode.TextEditor): string {
    if (editor.options.insertSpaces) {
      // This will always be a number when we're getting it from the options
      const tabSize = editor.options.tabSize as number;
      return ' '.repeat(tabSize);
    }
    return '\t';
  }

  static isFirstLine(position: vscode.Position): boolean {
    return position.line === 0;
  }

  static isLastLine(position: vscode.Position): boolean {
    return position.line === vscode.window.activeTextEditor!.document.lineCount - 1;
  }

  static getIndentationLevel(line: string): number {
    let tabSize = configuration.tabstop;

    let firstNonWhiteSpace = 0;
    let checkLine = line.match(/^\s*/);
    if (checkLine) {
      firstNonWhiteSpace = checkLine[0].length;
    }

    let visibleColumn: number = 0;

    if (firstNonWhiteSpace >= 0) {
      for (const char of line.substring(0, firstNonWhiteSpace)) {
        switch (char) {
          case '\t':
            visibleColumn += tabSize;
            break;
          case ' ':
            visibleColumn += 1;
            break;
          default:
            break;
        }
      }
    } else {
      return -1;
    }

    return visibleColumn;
  }

  static setIndentationLevel(line: string, screenCharacters: number): string {
    let tabSize = configuration.tabstop;
    let insertTabAsSpaces = configuration.expandtab;

    if (screenCharacters < 0) {
      screenCharacters = 0;
    }

    let indentString = '';

    if (insertTabAsSpaces) {
      indentString += new Array(screenCharacters + 1).join(' ');
    } else {
      if (screenCharacters / tabSize > 0) {
        indentString += new Array(Math.floor(screenCharacters / tabSize) + 1).join('\t');
      }

      indentString += new Array((screenCharacters % tabSize) + 1).join(' ');
    }

    let firstNonWhiteSpace = 0;
    let lineCheck = line.match(/^\s*/);
    if (lineCheck) {
      firstNonWhiteSpace = lineCheck[0].length;
    }

    return indentString + line.substring(firstNonWhiteSpace, line.length);
  }

  static getPositionAt(offset: number): Position {
    const pos = vscode.window.activeTextEditor!.document.positionAt(offset);
    return Position.FromVSCodePosition(pos);
  }

  static getOffsetAt(position: Position): number {
    return vscode.window.activeTextEditor!.document.offsetAt(position);
  }

  static getDocumentBegin(): Position {
    return new Position(0, 0);
  }

  static getDocumentEnd(textEditor?: vscode.TextEditor): Position {
    const lineCount = TextEditor.getLineCount(textEditor);
    const line = lineCount > 0 ? lineCount - 1 : 0;
    const char = TextEditor.getLineLength(line);

    return new Position(line, char);
  }
}

/**
 * Directions in the view for editor scroll command.
 */
export type EditorScrollDirection = 'up' | 'down';

/**
 * Units for editor scroll 'by' argument
 */
export type EditorScrollByUnit = 'line' | 'wrappedLine' | 'page' | 'halfPage';

/**
 * Positions in the view for cursor move command.
 */
export type CursorMovePosition =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'wrappedLineStart'
  | 'wrappedLineFirstNonWhitespaceCharacter'
  | 'wrappedLineColumnCenter'
  | 'wrappedLineEnd'
  | 'wrappedLineLastNonWhitespaceCharacter'
  | 'viewPortTop'
  | 'viewPortCenter'
  | 'viewPortBottom'
  | 'viewPortIfOutside';

/**
 * Units for Cursor move 'by' argument
 */
export type CursorMoveByUnit = 'line' | 'wrappedLine' | 'character' | 'halfLine';
