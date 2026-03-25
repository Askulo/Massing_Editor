import type { Command } from "../types";

export class HistoryManager {
  private stack: Command[] = [];
  private pointer = -1;
  private maxSteps = 20;
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  push(cmd: Command): void {
    // discard redo branch
    this.stack = this.stack.slice(0, this.pointer + 1);
    if (this.stack.length >= this.maxSteps) {
      this.stack.shift();
    }
    this.stack.push(cmd);
    this.pointer = this.stack.length - 1;
    this.onChange();
  }

  undo(): void {
    if (this.pointer < 0) return;
    this.stack[this.pointer].undo();
    this.pointer--;
    this.onChange();
  }

  redo(): void {
    if (this.pointer >= this.stack.length - 1) return;
    this.pointer++;
    this.stack[this.pointer].execute();
    this.onChange();
  }

  getStack() { return this.stack; }
  getPointer() { return this.pointer; }

  canUndo() { return this.pointer >= 0; }
  canRedo() { return this.pointer < this.stack.length - 1; }
}
