import {App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian'; 

interface RandomWikipediaArticleSettings {
	minHeaders: number;
	maxRetries: number;
	disallowedHeaders: string;
	noteFolder: string; 
}

const DEFAULT_SETTINGS: RandomWikipediaArticleSettings = {
	minHeaders: 3,
	maxRetries: 15,
	disallowedHeaders: 'See also, References, Further reading, External links, Notes, Contents, Source, Gallery, Additional sources, Other websites, Citations, Works cited, Footnotes, Links, Sources, Related, Bibliography',
	noteFolder: '', 
}

interface ParsedHeader {
	level: number;
	text: string;
}

export default class RandomWikipediaArticlePlugin extends Plugin {
	settings: RandomWikipediaArticleSettings;

	async onload() {
		await this.loadSettings();
		// console.log('Random Wikipedia Plugin loaded.'); // debug statement

		const handleInsertArticle = async () => {
			new Notice('Fetching Wikipedia article...');

			try {
				const articleData = await this.fetchAndProcessRandomWikipediaArticle();

				if (articleData) {
					const markdownContent = this.formatMarkdown(articleData);
					const fileName = `${articleData.datePrefix} Wikipedia Note - ${articleData.title}.md`;

					let fullPath = fileName;
					if (this.settings.noteFolder) {
						const cleanedFolder = this.settings.noteFolder.replace(/^\/|\/$/g, '');
						fullPath = `${cleanedFolder}/${fileName}`;

						const folderExists = await this.app.vault.adapter.exists(cleanedFolder);
						if (!folderExists) {
							try {
								await this.app.vault.createFolder(cleanedFolder);
								// console.log(`Created folder: ${cleanedFolder}`); // debug statement
							} catch (folderError) {
								console.error('Folder creation error:', folderError);
								new Notice(`Failed to create folder: ${cleanedFolder}. See console.`);
								return; 
							}
						}
					}

					const newFile: TFile = await this.app.vault.create(fullPath, markdownContent);
					new Notice(`Created: ${newFile.path}`); 

					const leaf = this.app.workspace.getLeaf('tab');
					await leaf.openFile(newFile);
					// console.log(`Opened: ${newFile.path}`); // debug statement

				} else {
					new Notice('No suitable Wikipedia article found.');
				}
			} catch (error) {
				console.error('Wikipedia fetch/insert error:', error);
				new Notice('Failed to fetch/insert Wikipedia article. See console.');
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
		// console.log('Random Wikipedia Plugin unloaded.'); // debug statement
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private getProcessedDisallowedHeaders(): string[] {
		return this.settings.disallowedHeaders
			.split(',')
			.map(h => h.trim())
			.filter(h => h.length > 0)
			.map(h => h.toLowerCase());
	}

	async fetchAndProcessRandomWikipediaArticle(): Promise<{ title: string; link: string; headers: ParsedHeader[]; datePrefix: string } | null> {
		let foundSuitableArticle = false;
		let retries = 0;
		let articleTitle = '';
		let articleLink = '';
		let articleHtml = '';
		let parsedHeaders: ParsedHeader[] = [];

		while (!foundSuitableArticle && retries < this.settings.maxRetries) {
			// console.log(`Attempt ${retries + 1}/${this.settings.maxRetries}`); // debug statement
			new Notice(`Fetching... (Attempt ${retries + 1})`, 1500);

			try {
				const randomTitleResponse = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/title');
				if (!randomTitleResponse.ok) {
					throw new Error(`REST API error: ${randomTitleResponse.status}`);
				}
				const randomTitleData = await randomTitleResponse.json();
				articleTitle = randomTitleData.items[0].title;
				articleLink = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`;
				// console.log(`Attempt ${retries + 1}: Title "${articleTitle}"`); // debug statement

				const apiUrl = new URL('https://en.wikipedia.org/w/api.php');
				apiUrl.searchParams.append('action', 'parse');
				apiUrl.searchParams.append('page', articleTitle);
				apiUrl.searchParams.append('prop', 'text');
				apiUrl.searchParams.append('format', 'json');
				apiUrl.searchParams.append('formatversion', '2');
				apiUrl.searchParams.append('origin', '*');

				const apiHtmlResponse = await fetch(apiUrl.toString());
				if (!apiHtmlResponse.ok) {
					throw new Error(`MediaWiki API error: ${apiHtmlResponse.status}`);
				}
				const apiData = await apiHtmlResponse.json();

				articleHtml = apiData?.parse?.text || '';

				// console.log(`Attempt ${retries + 1}: HTML length ${articleHtml.length}`); // debug statement
				// if (articleHtml.length < 500) {
				// 	console.warn(`Attempt ${retries + 1}: Small HTML snippet.`);
				// }

				parsedHeaders = this.parseWikipediaHtml(articleHtml);
				// console.log(`Attempt ${retries + 1}: Parsed ${parsedHeaders.length} headers.`); // debug statement

				if (parsedHeaders.length >= this.settings.minHeaders) {
					// console.log(`Found suitable: '${articleTitle}' (${parsedHeaders.length} headers).`); // debug statement
					foundSuitableArticle = true;
				} else {
					// console.log(`'${articleTitle}' too few headers (${parsedHeaders.length}). Retrying.`); // debug statement
					retries++;
				}

			} catch (error) {
				console.error(`Fetch/parse error (attempt ${retries + 1}):`, error);
				new Notice(`Parse failed (Attempt ${retries + 1}). See console.`, 2500);
				retries++;
				await new Promise(resolve => setTimeout(resolve, 500));
			}
		}

		if (foundSuitableArticle) {
			const datePrefix = window.moment().format("YYYY-MM-DD");
			return { title: articleTitle, link: articleLink, headers: parsedHeaders, datePrefix: datePrefix };
		} else {
			new Notice(`ERROR: No suitable article after ${this.settings.maxRetries} attempts. Adjust settings.`, 5000);
			return null;
		}
	}

	private parseWikipediaHtml(htmlContent: string): ParsedHeader[] {
		const parser = new DOMParser();
		const doc = parser.parseFromString(htmlContent, 'text/html');
		// console.log('Parsing HTML...'); // debug statement

		const headers: ParsedHeader[] = [];
		const parserOutputDiv = doc.querySelector('.mw-parser-output');
		const headingElements = parserOutputDiv ? parserOutputDiv.querySelectorAll('h2, h3, h4') : doc.querySelectorAll('h2, h3, h4');

		// console.log(`Found ${headingElements.length} raw headers.`); // debug statement
		const processedDisallowedHeaders = this.getProcessedDisallowedHeaders();

		headingElements.forEach((headingEl) => {
			const level = parseInt(headingEl.tagName.substring(1));
			let text = headingEl.textContent?.trim() || '';

			const editSpan = headingEl.querySelector('.mw-editsection');
			if (editSpan) {
				editSpan.remove();
				text = headingEl.textContent?.trim() || '';
			}

			if (processedDisallowedHeaders.includes(text.toLowerCase())) {
				// console.log(`Skipping disallowed header: "${text}".`); // debug statement
			} else {
				if (!headers.some(h => h.text === text && h.level === level)) {
					headers.push({ level, text });
					// console.log(`Added header: "${text}" (H${level}).`); // debug statement
				} else {
					// console.log(`Skipping duplicate header: "${text}" (H${level}).`); // debug statement
				}
			}
		});
		// console.log(`Finished parsing. Total suitable: ${headers.length}.`); // debug statement
		return headers;
	}

	formatMarkdown(articleData: { title: string; link: string; headers: ParsedHeader[]; datePrefix: string }): string {
		const { title, link, headers, datePrefix } = articleData;
		const currentDateTime = window.moment().format("YYYY-MM-DD HH:mm:ss");

		let headersMarkdown = '';
		if (headers.length > 0) {
			headersMarkdown += '\n## Sections:\n';

			headers.forEach(header => {
				const markdownLevel = '#'.repeat(header.level);
				headersMarkdown += `${markdownLevel} ${header.text}\n\n`;
			});
		} else {
			headersMarkdown += '\nNo significant sections found for this article.\n\n';
		}

		const markdownContent = `---
tags: wikipedia
---

${currentDateTime}
**Related Topics**:
**Link**: ${link}
# ${title} #wikipedia
${headersMarkdown}
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
			.setName('Minimum Headers')
			.setDesc('Minimum number of main section headers an article must have to be considered suitable. Articles with fewer headers will be skipped.')
			.addText(text => text
				.setPlaceholder('e.g., 5')
				.setValue(this.plugin.settings.minHeaders.toString())
				.onChange(async (value) => {
					const parsedValue = parseInt(value);
					this.plugin.settings.minHeaders = isNaN(parsedValue) ? DEFAULT_SETTINGS.minHeaders : parsedValue;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Maximum Retries')
			.setDesc('Maximum number of attempts to find a suitable article before giving up. Increase for more perseverance, decrease to fail faster.')
			.addText(text => text
				.setPlaceholder('e.g., 15')
				.setValue(this.plugin.settings.maxRetries.toString())
				.onChange(async (value) => {
					const parsedValue = parseInt(value);
					this.plugin.settings.maxRetries = isNaN(parsedValue) ? DEFAULT_SETTINGS.maxRetries : parsedValue;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Disallowed Headers')
			.setDesc('Comma-separated list of section titles to exclude from the generated notes (case-insensitive).')
			.addTextArea(text => {
				text
					.setPlaceholder('e.g., See also, References, External links')
					.setValue(this.plugin.settings.disallowedHeaders)
					.onChange(async (value) => {
						this.plugin.settings.disallowedHeaders = value;
						await this.plugin.saveSettings();
					});
                text.inputEl.rows = 5;
                text.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName('Note Folder')
			.setDesc('Specify a folder where new Wikipedia notes will be saved (e.g., "Wikipedia/Articles" or leave empty for vault root). The folder will be created if it does not exist.')
			.addText(text => text
				.setPlaceholder('e.g., Wikipedia/Articles')
				.setValue(this.plugin.settings.noteFolder)
				.onChange(async (value) => {
					this.plugin.settings.noteFolder = value.trim(); 
					await this.plugin.saveSettings();
				}));
	}
}
