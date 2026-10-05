<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img alt="Focus: four little boxes for a calmer brain" src="docs/assets/logo.svg" width="420">
</picture>

**A cozy drag-and-drop board for sorting your to-dos into what matters now, what matters later, and what can quietly float away.**

![Runs on your own computer](https://img.shields.io/badge/runs_on-your_own_computer-243cef?style=flat-square) ![Saves to one CSV file](https://img.shields.io/badge/saves_to-one_CSV_file-2fbf8f?style=flat-square) ![No account needed](https://img.shields.io/badge/account-not_needed-f5bf45?style=flat-square) ![The cloud is not invited](https://img.shields.io/badge/the_cloud-not_invited-8b95a5?style=flat-square)

</div>

<br>

![The Focus board with sample tasks sorted into four colorful quadrants](docs/assets/screenshot.png)

## What is this?

You know that feeling when everything on your list is shouting at once? Focus is a big, calm canvas with four boxes on it. You drop each task into the box where it belongs, and suddenly the shouting turns into a plan.

It's based on the **Eisenhower matrix**, a very old and very good trick: ask two questions about every task (*is it urgent?* and *is it important?*) and the answer tells you what to do with it.

- **Drag cards around** like sticky notes. Pan and zoom the canvas as much as you like.
- **Jot things down**: every card has room for notes, a due date, and links to whatever you need.
- **Never lose a half-typed task**: close the editor or the tab mid-thought and your draft is waiting when you come back.
- **Tick things off** and watch them move to your "Completed" pile.
- **Keyboard friendly**: <kbd>N</kbd> or <kbd>1</kbd>–<kbd>4</kbd> adds a task, <kbd>E</kbd> / <kbd>X</kbd> / <kbd>⌫</kbd> edit, complete or delete the card under your pointer, and <kbd>Alt</kbd> + arrow keys hop it to another box. While editing, <kbd>⌥</kbd> + <kbd>1</kbd>–<kbd>4</kbd> picks the box. Press <kbd>?</kbd> for the full list.
- **Your tasks are just a spreadsheet.** Everything lives in one plain `tasks.csv` file on your computer.

## The four boxes

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/quadrants-dark.svg">
  <img alt="The four quadrants. Do first: urgent and important. Schedule: important but not urgent. Delegate: urgent but less important. Let go: neither." src="docs/assets/quadrants.svg" width="880">
</picture>
</p>

- **Do first**: urgent *and* important. The fire is real; grab the extinguisher.
- **Schedule**: important, not urgent. This is where the good stuff lives, so give it a real slot on the calendar before it turns into a fire.
- **Delegate**: urgent, but not really yours. Hand it off, automate it, or do the tiniest version.
- **Let go**: neither. Permission granted to not do it. It's fine. Really.

A small secret: the more you look after **Schedule**, the quieter **Do first** gets.

## Up close

<p align="center">
  <img alt="Editing a card: quadrant picker, title, notes, a due date with quick picks, and a list of sources" src="docs/assets/screenshot-note.png" width="440">
  &nbsp;
  <img alt="The Done and dusted list: finished tasks grouped by day, one opened to show its original card and how long it took" src="docs/assets/screenshot-done.png" width="380">
</p>

Click any card to open it. Write as much or as little as you like, pick a date in one tap, and keep the links you need right next to the task. Deadlines warm up from grey to red as they get close (overdue ones catch a little fire), and a tiny hourglass keeps track of how long a task has been hanging around.

Tick something off and it bursts into confetti and flies into **Done & dusted**, where you can open any finished task to see the original card, whether it was on time, and how long it took. Changed your mind? **Put back** plants it on the board again.

## Where do my tasks go?

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-it-works-dark.svg">
  <img alt="You use the board in your browser, it saves every change to one tasks.csv file on your computer, and you can open that file in Numbers or Excel. Nothing goes to the cloud." src="docs/assets/how-it-works.svg" width="880">
</picture>
</p>

Nowhere far. Focus runs on your own computer and saves every change to a single file, `data/tasks.csv`. No sign-up, no sync server, nobody peeking. Want to see your tasks as a spreadsheet? Open the file in Numbers or Excel. Want a backup? Copy the file. That's the whole story.

## Get it running

You'll need [Node.js](https://nodejs.org) 22.12 or newer. Then, from this folder:

```sh
npm install
npm run build
npm run service:install
```

Now open **http://127.0.0.1:5180** and bookmark it. On a Mac, that last command keeps Focus running quietly in the background: it starts when you log in and picks itself back up if it ever trips. Your board is always one bookmark away.

Just want to try it once? Use `npm start` instead of `service:install`.

New versions announce themselves: an **Update** button pops up on the board, shows you what's new, and installs it in one click.

## The nerdy bits

Other ports, a different data file, Linux, hot-reload development, the CSV column reference and backups: it's all in **[docs/SETUP.md](docs/SETUP.md)**.

<br>

<p align="center"><sub>Made with care for people with too many tabs open.</sub></p>
