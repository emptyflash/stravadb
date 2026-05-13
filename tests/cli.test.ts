import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

function makeProgram(): Command {
  const program = new Command();
  program.name('stravadb').version('0.1.0').exitOverride();

  program
    .command('auth')
    .option('-p, --port <port>', 'port', '3000')
    .action(() => {});

  program
    .command('put')
    .argument('<key>')
    .argument('<file>')
    .action(() => {});

  program
    .command('get')
    .argument('<key>')
    .option('-o, --output <file>')
    .action(() => {});

  program.command('list').action(() => {});

  program
    .command('delete')
    .argument('<key>')
    .action(() => {});

  program
    .command('info')
    .argument('<key>')
    .action(() => {});

  return program;
}

describe('CLI argument parsing', () => {
  it('parses auth command', () => {
    const program = makeProgram();
    program.parse(['auth'], { from: 'user' });
  });

  it('parses auth with port option', () => {
    const program = makeProgram();
    program.parse(['auth', '--port', '4000'], { from: 'user' });
  });

  it('parses put command with required args', () => {
    const program = makeProgram();
    program.parse(['put', 'mykey', './file.txt'], { from: 'user' });
  });

  it('fails put command without args', () => {
    const program = makeProgram();
    expect(() => {
      program.parse(['put'], { from: 'user' });
    }).toThrow();
  });

  it('parses get command', () => {
    const program = makeProgram();
    program.parse(['get', 'mykey'], { from: 'user' });
  });

  it('parses get command with output flag', () => {
    const program = makeProgram();
    program.parse(['get', 'mykey', '-o', 'out.txt'], { from: 'user' });
  });

  it('parses list command', () => {
    const program = makeProgram();
    program.parse(['list'], { from: 'user' });
  });

  it('parses delete command', () => {
    const program = makeProgram();
    program.parse(['delete', 'mykey'], { from: 'user' });
  });

  it('parses info command', () => {
    const program = makeProgram();
    program.parse(['info', 'mykey'], { from: 'user' });
  });

  it('shows help text', () => {
    const program = makeProgram();
    const helpInfo = program.helpInformation();
    expect(helpInfo).toContain('stravadb');
    expect(helpInfo).toContain('auth');
    expect(helpInfo).toContain('put');
    expect(helpInfo).toContain('get');
    expect(helpInfo).toContain('list');
    expect(helpInfo).toContain('delete');
    expect(helpInfo).toContain('info');
  });
});
