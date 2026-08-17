import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

const CRLF = '\r\n';

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function cleanAddress(value) {
  const address = String(value || '').trim();
  if (!address || /[\r\n<>]/.test(address)) throw new Error('Некорректный почтовый адрес.');
  return address;
}

function dotStuff(value) {
  return value.replace(/^\./gm, '..');
}

function createReplyReader(socket) {
  let buffer = '';
  const waiting = [];
  const queued = [];

  const dispatch = (reply) => {
    const waiter = waiting.shift();
    if (waiter) waiter.resolve(reply);
    else queued.push(reply);
  };

  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    while (true) {
      const lines = buffer.split(CRLF);
      if (lines.length < 2) break;
      let endIndex = -1;
      for (let index = 0; index < lines.length - 1; index += 1) {
        if (/^\d{3} /.test(lines[index])) {
          endIndex = index;
          break;
        }
      }
      if (endIndex < 0) break;
      const replyLines = lines.slice(0, endIndex + 1);
      buffer = lines.slice(endIndex + 1).join(CRLF);
      dispatch({ code: Number(replyLines.at(-1).slice(0, 3)), text: replyLines.join('\n') });
    }
  });
  socket.on('error', (error) => {
    while (waiting.length) waiting.shift().reject(error);
  });
  socket.on('close', () => {
    while (waiting.length) waiting.shift().reject(new Error('SMTP-соединение закрыто.'));
  });

  return () => {
    if (queued.length) return Promise.resolve(queued.shift());
    return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
  };
}

async function expect(readReply, allowedCodes) {
  const reply = await readReply();
  if (!allowedCodes.includes(reply.code)) {
    throw new Error(`SMTP отклонил запрос (${reply.code}).`);
  }
  return reply;
}

export async function sendOtpMail({ host, port, user, pass, from, to, code, timeoutMs = 12000 }) {
  const recipient = cleanAddress(to);
  const sender = cleanAddress(from || user);
  const login = cleanAddress(user);
  if (!host || !pass) throw new Error('SMTP не настроен.');

  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  socket.setTimeout(timeoutMs);
  socket.on('timeout', () => socket.destroy(new Error('SMTP не ответил вовремя.')));
  const readReply = createReplyReader(socket);
  const write = (command) => socket.write(`${command}${CRLF}`);

  try {
    await new Promise((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });
    await expect(readReply, [220]);
    write('EHLO julia-rebrova.local');
    await expect(readReply, [250]);
    write('AUTH LOGIN');
    await expect(readReply, [334]);
    write(Buffer.from(login).toString('base64'));
    await expect(readReply, [334]);
    write(Buffer.from(pass).toString('base64'));
    await expect(readReply, [235]);
    write(`MAIL FROM:<${sender}>`);
    await expect(readReply, [250]);
    write(`RCPT TO:<${recipient}>`);
    await expect(readReply, [250, 251]);
    write('DATA');
    await expect(readReply, [354]);

    const subject = encodeHeader('Код входа в панель мастерской');
    const messageId = `${Date.now()}.${randomBytes(8).toString('hex')}@julia-rebrova.local`;
    const text = `Код подтверждения: ${code}\n\nОн действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте письмо.`;
    const html = `<!doctype html><html lang="ru"><body style="margin:0;background:#f3ece6;color:#332d33;font-family:Georgia,serif"><div style="max-width:560px;margin:0 auto;padding:48px 28px"><p style="margin:0 0 32px;color:#8b6d50;font:11px Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase">Мастерская Юлии Ребровой</p><h1 style="margin:0 0 18px;font-size:30px;font-weight:400">Подтвердите вход</h1><p style="margin:0 0 28px;color:#6d6469;font:15px/1.6 Arial,sans-serif">Введите этот код в панели управления. Он действует 10 минут.</p><div style="padding:24px;border:1px solid rgba(80,65,73,.18);background:#fffaf6;font:36px/1 Georgia,serif;letter-spacing:.22em;text-align:center">${code}</div><p style="margin:28px 0 0;color:#8a8186;font:12px/1.6 Arial,sans-serif">Если вы не запрашивали вход, просто проигнорируйте письмо.</p></div></body></html>`;
    const boundary = `julia-${randomBytes(12).toString('hex')}`;
    const message = [
      `From: ${encodeHeader('Мастерская Юлии Ребровой')} <${sender}>`,
      `To: <${recipient}>`,
      `Subject: ${subject}`,
      `Message-ID: <${messageId}>`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(text).toString('base64'),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html).toString('base64'),
      `--${boundary}--`,
      '',
    ].join(CRLF);

    socket.write(`${dotStuff(message)}${CRLF}.${CRLF}`);
    await expect(readReply, [250]);
    write('QUIT');
    await expect(readReply, [221]);
  } finally {
    socket.destroy();
  }
}
