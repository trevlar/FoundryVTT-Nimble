import type { DeepPartial } from '@league-of-foundry-developers/foundry-vtt-types/src/types/utils.d.mts';
import { SvelteApplicationMixin } from '#lib/SvelteApplicationMixin.svelte.js';
import getChoicesFromCompendium from '../../utils/getChoicesFromCompendium.js';
import getClassFeaturesByGroup from '../../utils/getClassFeaturesByGroup.js';
import sortDocumentsByName from '../../utils/sortDocumentsByName.js';
import CharacterCreationDialogComponent from '../../view/dialogs/CharacterCreationDialog.svelte';
import type { NimbleCharacter } from '../actor/character.js';

const { ApplicationV2 } = foundry.applications.api;

type Scalar = string | number | boolean | null | undefined;
type DialogData = Record<string, Scalar | object>;

type SpellSelection = { uuid: string; name: string };
type SpellSelectionsByRuleId = Record<string, SpellSelection[]>;
type SpellSchoolSelectionsByRuleId = Record<string, string[]>;

type OriginSelection = { uuid: string } | '' | null | undefined;

function getUuidFromSelection(selection: OriginSelection): string | null {
	if (!selection) return null;
	if (typeof selection === 'string') return null;
	if (!('uuid' in selection)) return null;
	const uuid = selection.uuid;
	return typeof uuid === 'string' && uuid.length > 0 ? uuid : null;
}

interface CharacterCreationSubmitResults {
	name?: string;
	origins?: {
		background?: OriginSelection;
		characterClass?: OriginSelection;
		ancestry?: OriginSelection;
	};
	abilityScores?: Record<string, number>;
	sizeCategory: string;
	skills?: Record<string, number>;
	languages: string[];
	spellSchoolSelections: SpellSchoolSelectionsByRuleId;
	spellSelections: SpellSelectionsByRuleId;
}

export default class CharacterCreationDialog extends SvelteApplicationMixin(ApplicationV2) {
	data: DialogData;
	parent: object | null;
	pack: object | null;

	protected root: typeof CharacterCreationDialogComponent;

	constructor(
		data: DialogData = {},
		{
			parent = null,
			pack = null,
			...options
		}: {
			parent?: object | null;
			pack?: object | null;
			[key: string]: Scalar | object;
		} = {},
	) {
		const width = 608;
		super(
			foundry.utils.mergeObject(options, {
				position: {
					width,
					top: Math.round(window.innerHeight * 0.1),
					left: Math.round((window.innerWidth - width) / 2),
				},
			}),
		);

		this.root = CharacterCreationDialogComponent;

		this.data = data;
		this.parent = parent;
		this.pack = pack;
	}

	static override DEFAULT_OPTIONS = {
		classes: ['nimble-sheet', 'nimble-dialog'],
		window: {
			icon: 'fa-solid fa-user',
			title: 'Character Creation Helper',
			resizable: true,
		},
		position: {
			height: 'auto',
		},
		actions: {},
	};

	protected async _prepareContext() {
		const ancestryOptions = this.prepareAncestryOptions();
		const backgroundOptions = this.prepareBackgroundOptions();
		const bonusLanguageOptions = this.prepareBonusLanguageOptions();
		const classOptions = this.prepareClassOptions();
		const statArrayOptions = this.prepareArrayOptions();

		return {
			ancestryOptions,
			backgroundOptions,
			bonusLanguageOptions,
			classOptions,
			statArrayOptions,
			dialog: this,
		};
	}

	async submit(results: CharacterCreationSubmitResults) {
		const actor = (await Actor.create(
			{ name: results.name || 'New Character', type: 'character' },
			{ renderSheet: true },
		)) as NimbleCharacter | null;

		const { background, characterClass, ancestry } = results?.origins ?? {};
		const originDocuments: NimbleBaseItem[] = [];

		const backgroundUuid = getUuidFromSelection(background);
		const classUuid = getUuidFromSelection(characterClass);
		const ancestryUuid = getUuidFromSelection(ancestry);

		const backgroundDocument = backgroundUuid
			? ((await fromUuid(backgroundUuid)) as NimbleBackgroundItem | null)
			: null;
		const classDocument = classUuid
			? ((await fromUuid(classUuid)) as NimbleClassItem | null)
			: null;
		const ancestryDocument = ancestryUuid
			? ((await fromUuid(ancestryUuid)) as NimbleAncestryItem | null)
			: null;

		if (backgroundDocument) {
			backgroundDocument._stats.compendiumSource = backgroundUuid;
			originDocuments.push(backgroundDocument);
		}

		if (classDocument) {
			classDocument._stats.compendiumSource = classUuid;
			originDocuments.push(classDocument);

			// Get and add class features based on groupIdentifiers
			const groupIdentifiers = classDocument.system.groupIdentifiers ?? [];
			if (groupIdentifiers.length > 0) {
				const featureUuids = await getClassFeaturesByGroup(groupIdentifiers, null);
				for (const featureUuid of featureUuids) {
					const featureDoc = (await fromUuid(featureUuid)) as NimbleFeatureItem | null;
					if (featureDoc) {
						// Defensive: character creation should only embed level-1 (level=null) features.
						// If a higher-level feature leaks into the list, skip it here.
						const featureLevel = (featureDoc.system as { level?: number | null }).level ?? null;
						if (featureLevel !== null && featureLevel > 1) continue;

						featureDoc._stats.compendiumSource = featureUuid;
						originDocuments.push(featureDoc);
					}
				}
			}
		}

		if (ancestryDocument) {
			ancestryDocument._stats.compendiumSource = ancestryUuid;
			originDocuments.push(ancestryDocument);
		}

		// Await the createEmbeddedDocuments call so rules can process properly
		await actor?.createEmbeddedDocuments('Item', originDocuments);
		await this.applyAndGrantSpellSelections(actor, results);

		await actor?.update({
			system: {
				'attributes.sizeCategory': results.sizeCategory,
				abilities: results.abilityScores ?? {},
				skills: results.skills ?? {},
				savingThrows: {
					[`${classDocument?.system.savingThrows.advantage}.defaultRollMode`]: 1,
					[`${classDocument?.system.savingThrows.disadvantage}.defaultRollMode`]: -1,
				},
				proficiencies: {
					languages: results.languages,
				},
			},
		});

		return super.close();
	}

	/**
	 * Apply selections from the character creation dialog to embedded rule objects and grant spells.
	 *
	 * Why this exists:
	 * - During `createEmbeddedDocuments`, `NimbleBaseItem.createDocuments` grants spells from rules in `preCreate`.
	 * - Mutating `item.system.rules` on a compendium document does not reliably affect the `_source` that is used for creation.
	 * - So we apply choices post-creation by calling the rule helper methods, which also grant the correct spells and prevent duplicates.
	 */
	private async applyAndGrantSpellSelections(
		actor: NimbleCharacter | null,
		results: CharacterCreationSubmitResults,
	): Promise<void> {
		if (!actor) return;

		type SelectSpellSchoolRuleInstance = {
			type: 'selectSpellSchool';
			id: string;
			setChosenSchools: (schools: string[]) => Promise<void>;
		};

		type SelectSpellRuleInstance = {
			type: 'selectSpell';
			id: string;
			addChosenSpells: (spellUuids: string[]) => Promise<void>;
		};

		type RuleInstance =
			| SelectSpellSchoolRuleInstance
			| SelectSpellRuleInstance
			| { type: string; id: string };

		type ItemWithRules = {
			rules: Map<string, RuleInstance>;
		};

		const spellSchoolSelections = results.spellSchoolSelections ?? {};
		const spellSelections = results.spellSelections ?? {};

		for (const item of actor.items) {
			const rulesMap = (item as { rules?: ItemWithRules['rules'] }).rules;
			if (!(rulesMap instanceof Map)) continue;

			for (const rule of rulesMap.values()) {
				if (rule.type === 'selectSpellSchool' && 'setChosenSchools' in rule) {
					const schools = spellSchoolSelections[rule.id] ?? [];
					if (schools.length > 0) {
						await rule.setChosenSchools(schools);
					}
				}

				if (rule.type === 'selectSpell' && 'addChosenSpells' in rule) {
					const selections = spellSelections[rule.id] ?? [];
					const uuids = selections.map((s) => s.uuid);
					if (uuids.length > 0) {
						await rule.addChosenSpells(uuids);
					}
				}
			}
		}
	}

	async close(
		options?: DeepPartial<foundry.applications.api.ApplicationV2.ClosingOptions>,
	): Promise<this> {
		return super.close(options);
	}

	async prepareAncestryOptions(): Promise<Record<'core' | 'exotic', NimbleAncestryItem[]>> {
		const coreAncestries: NimbleAncestryItem[] = [];
		const exoticAncestries: NimbleAncestryItem[] = [];

		const ancestryOptions = await Promise.all(
			getChoicesFromCompendium('ancestry').map(
				(uuid) => fromUuid(uuid) as Promise<NimbleAncestryItem | null>,
			),
		);

		for (const ancestry of ancestryOptions) {
			if (!ancestry) continue;
			const ancestryItem = ancestry as NimbleAncestryItem;

			if (ancestryItem.system.exotic) exoticAncestries.push(ancestry);
			else coreAncestries.push(ancestry);
		}

		return {
			core: sortDocumentsByName(
				coreAncestries as ({ name?: string } | null)[],
			) as NimbleAncestryItem[],
			exotic: sortDocumentsByName(
				exoticAncestries as ({ name?: string } | null)[],
			) as NimbleAncestryItem[],
		};
	}

	prepareArrayOptions() {
		const { statArrays, statArrayModifiers } = CONFIG.NIMBLE;

		interface StatArrayOption {
			key: string;
			array: number[];
			name: string;
		}

		return Object.entries(statArrayModifiers).reduce<StatArrayOption[]>((arrays, [key, array]) => {
			const values = Array.isArray(array) ? array : [];

			arrays.push({
				key,
				array: values,
				name: statArrays[key] as string,
			});

			return arrays;
		}, []);
	}

	async prepareBackgroundOptions(): Promise<NimbleBackgroundItem[]> {
		const compendiumChoices = getChoicesFromCompendium('background');

		const documents = await Promise.all(compendiumChoices.map((uuid) => fromUuid(uuid)));

		return sortDocumentsByName(documents as ({ name?: string } | null)[]) as NimbleBackgroundItem[];
	}

	prepareBonusLanguageOptions() {
		const { languages, languageHints } = CONFIG.NIMBLE;
		const { common: _, ...languageOptions } = languages;

		return Object.entries(languageOptions).map(([value, label]) => ({
			value,
			label,
			tooltip: languageHints[value],
		}));
	}

	async prepareClassOptions(): Promise<NimbleClassItem[]> {
		const compendiumChoices = getChoicesFromCompendium('class');

		const documents = await Promise.all(compendiumChoices.map((uuid) => fromUuid(uuid)));

		return sortDocumentsByName(documents as ({ name?: string } | null)[]) as NimbleClassItem[];
	}
}
