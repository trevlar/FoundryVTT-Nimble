import type { NimbleCharacter } from '../../documents/actor/character.js';
import getSpellsBySchoolAndTier from '../../utils/getSpellsBySchoolAndTier.js';
import { RecordField } from '../fields/RecordField.js';
import { NimbleBaseRule } from './base.js';

interface SpellAccessData {
	schools: Record<string, number>;
	schoolChoices: Record<string, string[]>;
	spellChoices: Record<string, string[]>;
}

function getOrCreateSpellAccess(actor: NimbleCharacter): SpellAccessData {
	const system = actor.system as { spellAccess?: Partial<SpellAccessData> };
	const existing = system.spellAccess;

	const spellAccess: SpellAccessData = {
		schools: existing?.schools ?? {},
		schoolChoices: existing?.schoolChoices ?? {},
		spellChoices: existing?.spellChoices ?? {},
	};

	system.spellAccess = spellAccess;
	return spellAccess;
}

function getActorClassIdentifiers(actor: NimbleCharacter): string[] {
	const classData = actor.system as { classData?: { levels?: string[] } };
	const levels = classData.classData?.levels ?? [];
	return Array.from(
		new Set(levels.filter((c): c is string => typeof c === 'string' && c.length > 0)),
	);
}

function schema() {
	const { fields } = foundry.data;

	return {
		type: new fields.StringField({ required: true, nullable: false, initial: 'selectSpell' }),
		spellType: new fields.StringField({
			required: true,
			nullable: false,
			initial: 'utility',
			choices: ['utility', 'tiered', 'any'],
		}),
		schoolSource: new fields.StringField({
			required: true,
			nullable: false,
			initial: 'known',
			choices: ['known', 'specific', 'any'],
		}),
		schools: new fields.ArrayField(
			new fields.StringField({ required: true, nullable: false, initial: '' }),
			{ required: true, nullable: false, initial: [] },
		),
		maxTier: new fields.NumberField({
			required: true,
			nullable: false,
			initial: 9,
			integer: true,
			min: 0,
			max: 9,
		}),
		baseChoiceCount: new fields.NumberField({
			required: true,
			nullable: false,
			initial: 1,
			integer: true,
			min: 0,
		}),
		levelProgression: new RecordField(
			new fields.StringField({ required: true, nullable: false, initial: '' }),
			new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
		),
		chosenSpells: new fields.ArrayField(
			new fields.StringField({ required: true, nullable: false, initial: '' }),
			{ required: true, nullable: false, initial: [] },
		),
	};
}

declare namespace SelectSpellRule {
	type Schema = NimbleBaseRule.Schema & ReturnType<typeof schema>;
}

class SelectSpellRule extends NimbleBaseRule<SelectSpellRule.Schema> {
	static override defineSchema(): SelectSpellRule.Schema {
		return {
			...NimbleBaseRule.defineSchema(),
			...schema(),
		};
	}

	override tooltipInfo(): string {
		return super.tooltipInfo(
			new Map([
				['spellType', 'utility | tiered | any'],
				['schoolSource', 'known | specific | any'],
				['schools', 'string[]'],
				['maxTier', 'number'],
				['baseChoiceCount', 'number'],
				['levelProgression', 'Record<number, number>'],
				['chosenSpells', 'string[]'],
			]),
		);
	}

	/**
	 * Get total number of spell choices available at a given level
	 */
	getTotalChoicesForLevel(characterLevel: number): number {
		let total = this.baseChoiceCount;

		for (const [levelStr, additionalChoices] of Object.entries(this.levelProgression)) {
			const level = parseInt(levelStr, 10);
			if (characterLevel >= level) {
				total += additionalChoices;
			}
		}

		return total;
	}

	/**
	 * Get number of remaining choices at current level
	 */
	getRemainingChoices(characterLevel: number): number {
		const total = this.getTotalChoicesForLevel(characterLevel);
		return Math.max(0, total - this.chosenSpells.length);
	}

	/**
	 * Check if this rule requires player input
	 */
	requiresSelection(characterLevel: number): boolean {
		return this.getRemainingChoices(characterLevel) > 0;
	}

	/**
	 * Get the schools to filter by based on schoolSource
	 */
	getFilterSchools(actor: NimbleCharacter): string[] {
		switch (this.schoolSource) {
			case 'known':
				// Get schools the character has access to
				return Object.keys(actor.system.spellAccess?.schools ?? {});
			case 'specific':
				return this.schools;
			default:
				// Return all spell schools (handles 'any' and fallback)
				return ['fire', 'ice', 'lightning', 'wind', 'radiant', 'necrotic'];
		}
	}

	/**
	 * Get available spell choices for the player
	 */
	async getAvailableSpells(actor: NimbleCharacter): Promise<
		Array<{
			uuid: string;
			name: string;
			img: string;
			school: string;
			tier: number;
			isUtility: boolean;
		}>
	> {
		const schools = this.getFilterSchools(actor);
		if (schools.length === 0) return [];

		const spells = await getSpellsBySchoolAndTier({
			schools,
			maxTier: this.maxTier,
			utilityOnly: this.spellType === 'utility',
			excludeUtility: this.spellType === 'tiered',
			allowedClasses: getActorClassIdentifiers(actor),
		});

		// Filter out spells already chosen by this rule
		const chosenSet = new Set(this.chosenSpells);

		// Filter out spells the character already has
		const existingSourceIds = new Set<string>();
		for (const item of actor.items) {
			if (item.type !== 'spell') continue;
			const spell = item as NimbleSpellItem;
			if (spell.sourceId) {
				existingSourceIds.add(spell.sourceId);
			}
		}

		return spells.filter((s) => !chosenSet.has(s.uuid) && !existingSourceIds.has(s.uuid));
	}

	/**
	 * Update character's spellAccess.spellChoices after data prep
	 */
	override afterPrepareData(): void {
		if (this.disabled) return;

		const actor = this.actor as NimbleCharacter;
		if (!actor || actor.type !== 'character') return;

		// Store the spell choices on the character for reference
		if (this.chosenSpells.length > 0 && this.identifier) {
			const spellAccess = getOrCreateSpellAccess(actor);
			spellAccess.spellChoices[this.identifier] = this.chosenSpells;
		}
	}

	/**
	 * Add chosen spells and grant them to the character
	 * Called from character creation or level-up dialog after player selection
	 */
	async addChosenSpells(spellUuids: string[]): Promise<void> {
		const actor = this.actor as NimbleCharacter;
		if (!actor || actor.type !== 'character') return;

		const characterLevel = actor.levels?.character ?? 1;
		const remainingChoices = this.getRemainingChoices(characterLevel);

		let uuidsToAdd = spellUuids;
		if (uuidsToAdd.length > remainingChoices) {
			console.warn(
				`Nimble | Too many spells selected (${uuidsToAdd.length} > ${remainingChoices})`,
			);
			uuidsToAdd = uuidsToAdd.slice(0, remainingChoices);
		}

		// Validate that chosen spells are valid options
		const availableSpells = await this.getAvailableSpells(actor);
		const availableUuids = new Set(availableSpells.map((s) => s.uuid));
		const validSpellUuids = uuidsToAdd.filter((uuid) => availableUuids.has(uuid));

		if (validSpellUuids.length !== uuidsToAdd.length) {
			console.warn(`Nimble | Some selected spells are not valid options`);
		}

		if (validSpellUuids.length === 0) return;

		// Update the rule with the new chosen spells
		const rules = this.item.system.rules as Array<{ id: string; chosenSpells?: string[] }>;
		const ruleIndex = rules.findIndex((r) => r.id === this.id);
		if (ruleIndex === -1) return;

		const newChosenSpells = [...this.chosenSpells, ...validSpellUuids];
		const updates: Record<string, string[]> = {
			[`system.rules.${ruleIndex}.chosenSpells`]: newChosenSpells,
		};

		await this.item.update(updates);

		// Grant the selected spells to the character
		const spellsToCreate: Item.Source[] = [];
		for (const uuid of validSpellUuids) {
			try {
				const spell = (await fromUuid(uuid)) as NimbleSpellItem | null;
				if (!spell) continue;

				const spellSource: Item.Source = spell.toObject();
				spellSource._id = foundry.utils.randomID();
				spellSource._stats.compendiumSource = uuid;

				spellsToCreate.push(spellSource);
			} catch (err) {
				console.warn(`Nimble | Failed to prepare spell ${uuid}:`, err);
			}
		}

		if (spellsToCreate.length > 0) {
			await actor.createEmbeddedDocuments('Item', spellsToCreate, { keepId: true });
		}
	}
}

export { SelectSpellRule };
