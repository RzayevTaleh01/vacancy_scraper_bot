const { Job, Intern } = require('../../models');
require('dotenv').config();

let modelName = [];
try {
    modelName = JSON.parse(process.env.MODEL_NAMES);
} catch (err) {
    console.error('❌ MODEL_NAMES .env faylında düzgün JSON deyil:', err.message);
}

module.exports = function (bot, isAllowed) {
    const PAGE_SIZE = 10;

    bot.onText(/\/list(?:\s(\d+))?(?:\s(\w+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!isAllowed(chatId)) return;

        const option = match[1];
        const statusFilter = match[2];

        if (!option) {
            const listOptions = `*📌 Hansı saytdan vakansiya siyahısı göstərilsin?*\n\n` +
                modelName.map(site => `${site.id} - ${site.name}`).join('\n') +
                `\n\n✏️ Misal:\n\`/list 1 pending\` — HelloJob üçün pending vakansiyalar`;
            return bot.sendMessage(chatId, listOptions, { parse_mode: 'Markdown' });
        }

        const page = 0;
        handlePagination(chatId, option, statusFilter, page);
    });

    bot.on('callback_query', async (query) => {
        const { message, data, id } = query;
        const chatId = message.chat.id;

        let payload;
        try {
            payload = JSON.parse(data);
        } catch {
            return bot.answerCallbackQuery(id, { text: '❌ Callback JSON düzgün deyil' });
        }

        if (payload.type !== 'list_page') return;

        await handlePagination(chatId, payload.option, payload.status, payload.page, message.message_id);
        bot.answerCallbackQuery(id);
    });

    async function handlePagination(chatId, option, statusFilter, page, messageId = null) {
        let Model;
        if (option === '1') {
            Model = Job;
        } else if (option === '2') {
            Model = Intern;
        } else {
            return bot.sendMessage(chatId, "❌ Yanlış seçim. `1` və ya `2` daxil edin.");
        }

        const query = statusFilter ? { status: statusFilter } : {};

        const [total, entries] = await Promise.all([
            Model.countDocuments(query),
            Model.find(query).sort({ createdAt: -1 }).skip(page * PAGE_SIZE).limit(PAGE_SIZE)
        ]);

        if (!entries.length) {
            return bot.sendMessage(chatId, `🔍 Heç bir vakansiya tapılmadı${statusFilter ? ` (status: ${statusFilter})` : ''}.`);
        }

        const site = modelName.find(x => x.id == option);
        let msgText = `📋 *${site?.name || 'Sayt'}* üçün bazadakı ${statusFilter ? `"${statusFilter}"` : 'son'} vakansiyalar (səhifə ${page + 1}):\n\n`;

        entries.forEach(j => {
            msgText += `🆔 \`${j._id}\`\n💼 ${j.title || j.head}\n🏢 ${j.company}\n`;

            if (option === '2') {
                msgText += `📅 Tarix: ${j.start_date} - ${j.end_date}\n`;
            }

            msgText += `🔗 ${j.link || j.base_url}\n📌 Status: ${j.status || 'yoxdur'}\n\n`;
        });

        const hasMore = (page + 1) * PAGE_SIZE < total;
        const inline_keyboard = [];

        const navButtons = [];

        if (page > 0) {
            navButtons.push({
                text: '⬅️ Əvvəlki',
                callback_data: JSON.stringify({
                    type: 'list_page',
                    option,
                    status: statusFilter,
                    page: page - 1
                })
            });
        }

        if (hasMore) {
            navButtons.push({
                text: '➡️ Növbəti',
                callback_data: JSON.stringify({
                    type: 'list_page',
                    option,
                    status: statusFilter,
                    page: page + 1
                })
            });
        }

        if (navButtons.length > 0) {
            inline_keyboard.push(navButtons);
        }

        const options = {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard
            }
        };

        if (messageId) {
            return bot.editMessageText(msgText, {
                ...options,
                chat_id: chatId,
                message_id: messageId
            });
        } else {
            return bot.sendMessage(chatId, msgText, options);
        }
    }
};
