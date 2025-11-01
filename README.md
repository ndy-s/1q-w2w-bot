# 1Q W2W Bot
I built this little automation tool to help our dev team stay updated without having to check the monitoring dashboard every morning.

Every day, we watch our banking application running in production using [WhaTap](https://www.whatap.io/) for error tracking. Normally, someone has to log in, click around, apply filters, and export the errors to Excel. It is repetitive, mundane, and honestly a bit boring. Plus, doing it manually can be prone to mistakes. I thought, why not automate this?

So I built this bot. It connects to WhatsApp and sends a daily summary of errors straight to our group chat automatically every morning. The bot pulls the data using a simple Python script, turns it into a CSV report, and then converts that into a nicely formatted image using [Puppeteer](https://pptr.dev/). Finally, it sends the image through [Baileys](https://github.com/WhiskeySockets/Baileys), the WhatsApp Web API.

I named this project 1Q W2W Bot because our team is called 1Q, and the bot's main purpose is to send daily WhaTap reports to WhatsApp. W2W is just a shorthand for "WhaTap to WhatsApp," which felt simple, memorable, and professional enough for an internal tool.

## Features
The bot automatically posts the daily WhaTap report to the WhatsApp group we set in `.env`. It only responds inside whitelisted groups, which we also define in `.env`. That way, it ignores unrelated chats or test groups.

There's a little access control too. Only authorized users, also listed in `.env`, can run sensitive commands like updating the WhaTap login password. Instead of opening the server and editing `.env` manually, they can just send a WhatsApp command like `@Bot !setpassword newpassword`, and the bot updates it automatically.

Everything else is completely scheduled. I run it on a cron job set to 08:31 AM (Asia/Jakarta). The bot handles reconnections, retries, and report generation all by itself, so no one has to babysit it.


## Commands
I kept the commands simple, just enough to do what the team actually needs.

You can mention the bot and type:
* `@Bot monitoring`: this will generate the latest daily report.
* `@Bot monitoring <start> <end>`: this generates a report for a custom date range. Make sure the dates are in `DD-MM-YYYY` format.
* `@Bot !setpassword <new>`: updates the WhaTap password (only for authorized users).
* `@Bot !help`: shows the available commands and how to use them.

That's it. Easy to remember, easy to use, and it covers all the workflow we need.

## Personal Note
This project is not a huge system or anything fancy. It's more like a quiet assistant that just keeps everyone informed. I built it mainly for internal use, but it was also a fun little experiment in combining Python, Node.js, automation, and WhatsApp messaging in one project.

## License
MIT

