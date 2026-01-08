import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // .env もあれば読む（.env.local優先）
// デバッグ用: GMAIL_CLIENT_IDの先頭8文字だけ表示
console.log('GMAIL_CLIENT_ID loaded:', process.env.GMAIL_CLIENT_ID?.slice(0,8));
import http from 'node:http';
import { google } from 'googleapis';

function mustEnv(k: string) {
  const v = process.env[k];
  if (!v) {
    console.error(`\n[.env.local] の ${k} が見つかりません。形式は KEY=VALUE（空白なし）で記載してください。`);
    throw new Error(`Missing env: ${k} (set it in .env.local)`);
  }
  return v;
}

async function main() {
  const clientId = mustEnv('GMAIL_CLIENT_ID');
  const clientSecret = mustEnv('GMAIL_CLIENT_SECRET');

  const port = 53682;
  const redirectUri = `http://localhost:${port}/oauth2callback`;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.compose'],
  });

  console.log('\n1) Open this URL in your browser and approve access:\n');
  console.log(authUrl);
  console.log('\nWaiting for OAuth redirect...\n');

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) return;
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname !== '/oauth2callback') {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');

      if (err) {
        res.statusCode = 400;
        res.end(`OAuth error: ${err}`);
        console.error('OAuth error:', err);
        server.close();
        return;
      }

      if (!code) {
        res.statusCode = 400;
        res.end('Missing code');
        server.close();
        return;
      }

      const { tokens } = await oauth2.getToken(code);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('OK! You can close this tab and go back to the terminal.');

      console.log('\n=== OAuth Tokens Received ===');
      if (tokens.refresh_token) {
        console.log('\n✅ COPY THIS refresh token into .env.local:\n');
        console.log(tokens.refresh_token);
        console.log('\nAdd this line to .env.local:');
        console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      } else {
        console.log('\n⚠️ refresh_token was NOT returned.');
        console.log('Common reasons: you already granted access before for this client.');
        console.log('Fix: revoke the app access in your Google Account security settings, then run again; or create a new OAuth client.\n');
      }

      server.close();
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end('Internal Server Error');
      server.close();
    }
  });

  server.listen(port, () => {
    console.log(`Listening on ${redirectUri}`);
  });
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
