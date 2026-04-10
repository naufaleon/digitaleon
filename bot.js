import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ADMIN_ID,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = "main",
  GITHUB_CONFIG_PATH = "config.json"
} = process.env;

if (
  !TELEGRAM_BOT_TOKEN ||
  !TELEGRAM_ADMIN_ID ||
  !GITHUB_TOKEN ||
  !GITHUB_OWNER ||
  !GITHUB_REPO
) {
  console.error("ENV belum lengkap. Cek .env");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

function isAdmin(msg) {
  return String(msg.from.id) === String(TELEGRAM_ADMIN_ID);
}

function denyAccess(chatId) {
  bot.sendMessage(chatId, "Akses ditolak.");
}

async function githubRequest(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function getConfigFile() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_CONFIG_PATH}?ref=${GITHUB_BRANCH}`;
  const data = await githubRequest(url, { method: "GET" });

  const content = Buffer.from(data.content, "base64").toString("utf8");
  return {
    sha: data.sha,
    config: JSON.parse(content)
  };
}

async function updateConfigFile(newConfig, oldSha, message) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_CONFIG_PATH}`;
  const contentBase64 = Buffer.from(JSON.stringify(newConfig, null, 2), "utf8").toString("base64");

  return githubRequest(url, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: contentBase64,
      sha: oldSha,
      branch: GITHUB_BRANCH
    })
  });
}

function helpText() {
  return `
Perintah bot:

/help
/showconfig
/settitle Judul Website
/setdesc Deskripsi website
/setlogo https://link-logo.png

/setbutton <nomor>|<text>|<url>
Contoh:
/setbutton 1|📸 Instagram @naufaleon.id|https://instagram.com/naufaleon.id

/delbutton <nomor>
Contoh:
/delbutton 4

/addposter https://link-gambar.png
/delposter <nomor>
Contoh:
/delposter 2

/listbuttons
/listposters
`;
}

bot.onText(/\/start/, async (msg) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);
  await bot.sendMessage(msg.chat.id, "Bot aktif.\n\n" + helpText());
});

bot.onText(/\/help/, async (msg) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);
  await bot.sendMessage(msg.chat.id, helpText());
});

bot.onText(/\/showconfig/, async (msg) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const { config } = await getConfigFile();
    await bot.sendMessage(msg.chat.id, `<pre>${escapeHtml(JSON.stringify(config, null, 2))}</pre>`, {
      parse_mode: "HTML"
    });
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal ambil config:\n" + err.message);
  }
});

bot.onText(/\/settitle (.+)/, async (msg, match) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const newTitle = match[1].trim();
    const { sha, config } = await getConfigFile();
    config.title = newTitle;

    await updateConfigFile(config, sha, `Update title via Telegram bot`);
    await bot.sendMessage(msg.chat.id, `Judul berhasil diubah menjadi:\n${newTitle}`);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal update title:\n" + err.message);
  }
});

bot.onText(/\/setdesc (.+)/, async (msg, match) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const newDesc = match[1].trim();
    const { sha, config } = await getConfigFile();
    config.description = newDesc;

    await updateConfigFile(config, sha, `Update description via Telegram bot`);
    await bot.sendMessage(msg.chat.id, `Deskripsi berhasil diubah.`);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal update description:\n" + err.message);
  }
});

bot.onText(/\/setlogo (.+)/, async (msg, match) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const newLogo = match[1].trim();
    const { sha, config } = await getConfigFile();
    config.logo = newLogo;

    await updateConfigFile(config, sha, `Update logo via Telegram bot`);
    await bot.sendMessage(msg.chat.id, `Logo berhasil diubah.`);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal update logo:\n" + err.message);
  }
});

bot.onText(/\/setbutton (.+)/, async (msg, match) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const raw = match[1].trim();
    const parts = raw.split("|");

    if (parts.length < 3) {
      return bot.sendMessage(
        msg.chat.id,
        "Format salah.\nContoh:\n/setbutton 1|📸 Instagram @naufaleon.id|https://instagram.com/naufaleon.id"
      );
    }

    const index = Number(parts[0].trim()) - 1;
    const text = parts[1].trim();
    const url = parts.slice(2).join("|").trim();

    if (Number.isNaN(index) || index < 0) {
      return bot.sendMessage(msg.chat.id, "Nomor button tidak valid.");
    }

    const { sha, config } = await getConfigFile();

    if (!Array.isArray(config.buttons)) config.buttons = [];

    config.buttons[index] = { text, url };

    await updateConfigFile(config, sha, `Update button ${index + 1} via Telegram bot`);
    await bot.sendMessage(msg.chat.id, `Button ${index + 1} berhasil diubah.`);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal update button:\n" + err.message);
  }
});

bot.onText(/\/delbutton (\d+)/, async (msg, match) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const index = Number(match[1]) - 1;
    const { sha, config } = await getConfigFile();

    if (!Array.isArray(config.buttons) || !config.buttons[index]) {
      return bot.sendMessage(msg.chat.id, "Button tidak ditemukan.");
    }

    config.buttons.splice(index, 1);

    await updateConfigFile(config, sha, `Delete button ${index + 1} via Telegram bot`);
    await bot.sendMessage(msg.chat.id, `Button ${index + 1} berhasil dihapus.`);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal hapus button:\n" + err.message);
  }
});

bot.onText(/\/listbuttons/, async (msg) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const { config } = await getConfigFile();
    const buttons = config.buttons || [];

    if (!buttons.length) {
      return bot.sendMessage(msg.chat.id, "Belum ada button.");
    }

    const text = buttons
      .map((btn, i) => `${i + 1}. ${btn.text}\n${btn.url}`)
      .join("\n\n");

    await bot.sendMessage(msg.chat.id, text);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal ambil button:\n" + err.message);
  }
});

bot.onText(/\/addposter (.+)/, async (msg, match) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const posterUrl = match[1].trim();
    const { sha, config } = await getConfigFile();

    if (!Array.isArray(config.posters)) config.posters = [];
    config.posters.push(posterUrl);

    await updateConfigFile(config, sha, `Add poster via Telegram bot`);
    await bot.sendMessage(msg.chat.id, `Poster berhasil ditambahkan.`);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal tambah poster:\n" + err.message);
  }
});

bot.onText(/\/delposter (\d+)/, async (msg, match) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const index = Number(match[1]) - 1;
    const { sha, config } = await getConfigFile();

    if (!Array.isArray(config.posters) || !config.posters[index]) {
      return bot.sendMessage(msg.chat.id, "Poster tidak ditemukan.");
    }

    config.posters.splice(index, 1);

    await updateConfigFile(config, sha, `Delete poster ${index + 1} via Telegram bot`);
    await bot.sendMessage(msg.chat.id, `Poster ${index + 1} berhasil dihapus.`);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal hapus poster:\n" + err.message);
  }
});

bot.onText(/\/listposters/, async (msg) => {
  if (!isAdmin(msg)) return denyAccess(msg.chat.id);

  try {
    const { config } = await getConfigFile();
    const posters = config.posters || [];

    if (!posters.length) {
      return bot.sendMessage(msg.chat.id, "Belum ada poster.");
    }

    const text = posters.map((url, i) => `${i + 1}. ${url}`).join("\n\n");
    await bot.sendMessage(msg.chat.id, text);
  } catch (err) {
    await bot.sendMessage(msg.chat.id, "Gagal ambil poster:\n" + err.message);
  }
});

bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
});

console.log("Bot berjalan...");

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
