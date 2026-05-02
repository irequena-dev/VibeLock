import password from '@inquirer/password';
import confirm from '@inquirer/confirm';
import input from '@inquirer/input';
import { createInterface } from 'readline';

export async function promptSecret(label?: string): Promise<string> {
  if (process.stdin.isTTY === true) {
    return password({ message: label ?? "Value: ", mask: "" });
  } else {
    // Non-TTY environment - read from stdin
    return new Promise((resolve, reject) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question('', (answer) => {
        const trimmedAnswer = answer.trim();
        if (trimmedAnswer === '') {
          reject(new Error('Empty input not allowed'));
        } else {
          resolve(trimmedAnswer);
        }
        rl.close();
      });
    });
  }
}

export async function promptInput(message: string, defaultValue: string): Promise<string> {
  if (process.stdin.isTTY === true) {
    return input({ message, default: defaultValue });
  }
  return defaultValue;
}

export async function promptConfirm(message: string): Promise<boolean> {
  if (process.stdin.isTTY === true) {
    return confirm({ message, default: false });
  } else {
    // Non-TTY environment - read from stdin
    return new Promise((resolve) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question(`${message} [y/N]: `, (answer) => {
        const trimmedAnswer = answer.trim().toLowerCase();
        const isYes = trimmedAnswer === 'y' || trimmedAnswer === 'yes';
        resolve(isYes);
        rl.close();
      });
    });
  }
}