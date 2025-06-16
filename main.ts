import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface RandomWikipediaArticleSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: RandomWikipediaArticleSettings = {
	mySetting: 'default'
}

export default class RandomWikipediaArticlePlugin extends Plugin {
	settings: RandomWikipediaArticleSettings;

	// TODO: Make configurable
	MIN_HEADERS = 1;
	MAX_RETRIES = 15;

	async onload() {
		await this.loadSettings();

		console.log('Random Wikipedia Article Plugin loaded');

		const handleInsertArticle = async () => {
			new Notice('Fetching random Wikipedia article...');

			try {
				const articleData = await this.fetchAndProcessRandomWikipediaArticle();

				if (articleData) {
					const markdownContent = this.formatMarkdown(articleData);

					const fileName = `${articleData.datePrefix} Wikipedia Note - ${articleData.title}.md`;
					await this.app.vault.create(fileName, markdownContent);
					new Notice(`Created new note: ${fileName}`);

				} else {
					new Notice('Could not find a suitable Wikipedia article. Roll again.');
				}
			} catch (error) {
				console.error('Error fetching or inserting Wikipedia article:', error);
				new Notice('Failed to fetch or insert Wikipedia article. Check console for details.');
			}
		};


		this.addCommand({
			id: 'insert-random-wikipedia-article',
			name: 'Insert Random Wikipedia Article',
			callback: handleInsertArticle
		});

		const ribbonIconEl = this.addRibbonIcon('dice', 'Insert Random Wikipedia Article', async (evt: MouseEvent) => {
			handleInsertArticle();
		});

		ribbonIconEl.addClass('random-wikipedia-plugin-ribbon-icon');

		this.addSettingTab(new RandomWikipediaArticleSettingTab(this.app, this));
	}

	onunload() {
		console.log('Random Wikipedia Article Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async fetchAndProcessRandomWikipediaArticle(): Promise<{ title: string; link: string; extract: string; datePrefix: string } | null> {
		let foundSuitableArticle = false;
		let retries = 0;
		let articleTitle = '';
		let articleLink = '';
		let articleExtract = '';

		while (!foundSuitableArticle && retries < this.MAX_RETRIES) {
			console.log(`Attempting to fetch article (retry ${retries + 1}/${this.MAX_RETRIES})`);
			new Notice(`Fetching article... (Attempt ${retries + 1})`, 1500);

			try {
				const randomTitleResponse = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/title');
				if (!randomTitleResponse.ok) {
					throw new Error(`HTTP error fetching random title. Status: ${randomTitleResponse.status}`);
				}
				const randomTitleData = await randomTitleResponse.json();
				articleTitle = randomTitleData.items[0].title;
				articleLink = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`;

				const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`);
				if (!summaryResponse.ok) {
					throw new Error(`HTTP error fetching summary for "${articleTitle}". Status: ${summaryResponse.status}`);
				}
				const summaryData = await summaryResponse.json();
				articleExtract = summaryData.extract || '';

				if (articleExtract.length > 0) {
					console.log(`Found suitable article: '${articleTitle}' with content length ${articleExtract.length}.`);
					foundSuitableArticle = true;
				} else {
					console.log(`Article '${articleTitle}' has no extract. Trying again.`);
					retries++;
				}

			} catch (error) {
				console.error('Error during Wikipedia API fetch:', error);
				new Notice(`Failed to fetch article (Attempt ${retries + 1}). See console for details.`, 2500);
				retries++;
				await new Promise(resolve => setTimeout(resolve, 500));
			}
		}

		if (foundSuitableArticle) {
			const datePrefix = window.moment().format("YYYY-MM-DD");
			return { title: articleTitle, link: articleLink, extract: articleExtract, datePrefix: datePrefix };
		} else {
			new Notice(`ERROR: Could not find a suitable article after ${this.MAX_RETRIES} attempts.`, 5000);
			return null;
		}
	}

	formatMarkdown(articleData: { title: string; link: string; extract: string; datePrefix: string }): string {
		const { title, link, extract, datePrefix } = articleData;
		const currentDateTime = window.moment().format("YYYY-MM-DD HH:mm:ss");

		const markdownContent = `---
tags: wikipedia
---

${currentDateTime}
**Related Topics**:
**Link**: ${link}
# ${title} #wikipedia

${extract}

[Read more on Wikipedia](${link})
`;
		return markdownContent;
	}
}

class RandomWikipediaArticleSettingTab extends PluginSettingTab {
	plugin: RandomWikipediaArticlePlugin;

	constructor(app: App, plugin: RandomWikipediaArticlePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Random Wikipedia Article Plugin Settings'});

		new Setting(containerEl)
			.setName('Placeholder Setting')
			.setDesc('This is a placeholder setting.')
			.addText(text => text
				.setPlaceholder('Enter something')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
