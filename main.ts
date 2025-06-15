import {App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface RandomWikipediaArticleSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: RandomWikipediaArticleSettings = {
	mySetting: 'default'
}

export default class RandomWikipediaArticlePlugin extends Plugin {

	settings: RandomWikipediaArticleSettings;

	async onload() {
		await this.loadSettings();
		console.log('Random Wikipedia Article Plugin loaded');
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
}

class RandomWikipediaArticleSettingsTab extends PluginSettingTab {

	plugin: RandomWikipediaArticlePlugin;

	constructor(app: App, plugin: RandomWikipediaArticlePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {

		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Random Wikipedia Article Plugin Settings'});

		new Setting(containerEl).setName('Placeholder Setting')
		.setDesc('This is a placeholder settting')
		.addText(text => text.setPlaceholder('Enter Value')
		.setValue(this.plugin.settings.mySetting)
		.onChange(async (value) => {this.plugin.settings.mySetting = value; await this.plugin.saveSettings();}))

	}

}

