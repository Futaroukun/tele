/*
- Feature: Owner Code Executor
- Description: Memungkinkan owner menjalankan perintah shell dan mengevaluasi kode JavaScript secara dinamis.
*/

import syntaxerror from 'syntax-error';
import { format, inspect } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
import cp, { exec as _exec } from 'child_process';
import { promisify } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(__dirname);
const exec = promisify(_exec).bind(cp);

class CustomArray extends Array {
  constructor(...args) {
    if (typeof args[0] == 'number') return super(Math.min(args[0], 10000));
    else return super(...args);
  }
}

let handler = async (m, _2) => {
  let { conn, usedPrefix, noPrefix, args, command, text } = _2;

  if (/^\$/.test(usedPrefix + command + ' ')) {
    m.reply('Executing...');
    let o;
    try {
      o = await exec(command.trimStart() + ' ' + text.trimEnd());
    } catch (e) {
      o = e;
    } finally {
      let { stdout, stderr } = o;
      if (stdout?.trim()) m.reply(stdout);
      if (stderr?.trim()) m.reply(stderr);
    }
    return;
  }

  let execConn = conn;
  let execUser = conn.user;
  
  if (m.quoted) {
    const quotedSender = m.quoted.sender;
    const quotedName = await conn.getName(quotedSender);
    execUser = {
      id: quotedSender,
      name: quotedName,
      lid: quotedSender
    };
    execConn = Object.create(conn);
    execConn.user = execUser;
  }

  let _return;
  let _syntax = '';
  let _text = (/^=/.test(usedPrefix) ? 'return ' : '') + noPrefix;
  try {
    let i = 15;
    let f = { exports: {} };
    let execFn = new (async () => {}).constructor(
      'print', 'm', 'quoted', 'handler', 'require', 'conn',
      'Array', 'process', 'args',
      'module', 'exports', 'argument', 'user',
      _text
    );
    _return = await execFn.call(
      execConn,
      (...args) => {
        if (--i < 1) return;
        return execConn.reply(m.chat, format(...args), m);
      },
      m, m.quoted, handler, require, execConn,
      CustomArray, process, args,
      f, f.exports, [execConn, _2], execUser
    );
  } catch (e) {
    let err = syntaxerror(_text, 'Execution Function', {
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      sourceType: 'module'
    });
    if (err) _syntax = '```' + err + '```\n\n';
    _return = e;
  } finally {
    let output = _return;
    
    if (output instanceof Error) {
        output = output.stack || output.message || output;
    } else if (output != null && typeof output === 'object') {
        try {
            const cleanObj = {};
            for (let key in output) {
                try {
                    cleanObj[key] = output[key];
                } catch (e) {
                    cleanObj[key] = `[Getter Error: ${e.message}]`;
                }
            }
            output = inspect(cleanObj, { depth: 1, colors: false });
        } catch (e) {
            output = inspect(output, { depth: 1, colors: false });
        }
    } else {
        output = format(output);
    }
    
    conn.reply(m.chat, _syntax + output, m);
  }
};

handler.help = ['> ', '=> ', '$'];
handler.tags = ['owner'];
handler.customPrefix = /^(=?> |\$ )/;
handler.command = /(?:)/i;
handler.owner = true;

export default handler;
