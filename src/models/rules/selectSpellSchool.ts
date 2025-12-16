import type { NimbleCharacter } from '../../documents/actor/character.js';
import type { NimbleBaseItem } from '../../documents/item/base.svelte.js';
import getCharacterMissingSpells from '../../utils/getCharacterMissingSpells.js';
import { NimbleBaseRule } from './base.js';

interface SpellAccessData {
	schools: Record<string, number>;
	schoolChoices: Record<string, string[]>;
	spellChoices: Record<string, string[]>;
}

interface RulePreCreateArgs {
	pendingItems: Item.Source[];
	operation: { keepId?: boolean };
	tempItems: Array<Item.Source | Item>;
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

function schema() {
	const { fields } = foundry.data;

	return {
		type: new fields.StringField({ required: true, nullable: false, initial: 'selectSpellSchool' }),
		fixedSchools: new fields.ArrayField(
			new fields.StringField({ required: true, nullable: false, initial: '' }),
			{ required: true, nullable: false, initial: [] },
		),
		choiceCount: new fields.NumberField({
			required: true,
			nullable: false,
			initial: 1,
			integer: true,
			min: 0,
		}),
		choiceOptions: new fields.ArrayField(
			new fields.StringField({ required: true, nullable: false, initial: '' }),
			{ required: true, nullable: false, initial: [] },
		),
		baseTier: new fields.NumberField({
			required: true,
			nullable: false,
			initial: 0,
			integer: true,
			min: 0,
			max: 9,
		}),
		excludeUtility: new fields.BooleanField({ required: true, nullable: false, initial: true }),
		chosenSchools: new fields.ArrayField(
			new fields.StringField({ required: true, nullable: false, initial: '' }),
			{ required: true, nullable: false, initial: [] },
		),
	};
}

declare namespace SelectSpellSchoolRule {
	type Schema = NimbleBaseRule.Schema & ReturnType<typeof schema>;
}

class SelectSpellSchoolRule extends NimbleBaseRule<SelectSpellSchoolRule.Schema> {
	static override defineSchema(): SelectSpellSchoolRule.Schema {
		return {
			...NimbleBaseRule.defineSchema(),
			...schema(),
		};
	}

	override tooltipInfo(): string {
		return super.tooltipInfo(
			new Map([
				['fixedSchools', 'string[]'],
				['choiceCount', 'number'],
				['choiceOptions', 'string[]'],
				['baseTier', 'number'],
				['excludeUtility', 'boolean'],
				['chosenSchools', 'string[]'],
			]),
		);
	}

	/**
	 * Get all schools that this rule grants (fixed + chosen)
	 */
	getAllGrantedSchools(): string[] {
		return [...this.fixedSchools, ...this.chosenSchools];
	}

	/**
	 * Check if this rule requires player input (school selection)
	 */
	requiresSelection(): boolean {
		return this.choiceCount > 0 && this.chosenSchools.length < this.choiceCount;
	}

	/**
	 * Update the character's spellAccess.schools after data prep
	 */
	override afterPrepareData(): void {
		if (this.disabled) return;

		const actor = this.actor as NimbleCharacter;
		if (!actor || actor.type !== 'character') return;

		const spellAccess = getOrCreateSpellAccess(actor);

		const allSchools = this.getAllGrantedSchools();

		// Update spellAccess.schools for each school this rule grants
		for (const school of allSchools) {
			const schoolLower = school.toLowerCase();
			const currentMaxTier = spellAccess.schools[schoolLower] ?? -1;

			// Only update if this rule grants a higher tier
			if (this.baseTier > currentMaxTier) {
				spellAccess.schools[schoolLower] = this.baseTier;
			}
		}

		// Store the school choices on the character for reference
		if (this.chosenSchools.length > 0 && this.identifier) {
			spellAccess.schoolChoices[this.identifier] = this.chosenSchools;
		}
	}

	/**
	 * Grant spells from fixed schools AND chosen schools when the feature is added
	 */
	override async preCreate(args: RulePreCreateArgs): Promise<void> {
		if (this.disabled) return;

		const { pendingItems, operation, tempItems } = args;

		const actor = this.actor as NimbleCharacter;
		if (!actor || actor.type !== 'character') return;

		// Grant spells from both fixed and chosen schools
		const allSchools = this.getAllGrantedSchools();
		if (allSchools.length === 0) return;

		const missingSpells = await getCharacterMissingSpells(actor, {
			schools: allSchools,
			maxTier: this.baseTier,
			utilityOnly: false,
			excludeUtility: this.excludeUtility,
		});

		for (const spellInfo of missingSpells) {
			const alreadyPending = pendingItems.some(
				(s) => (s._stats?.compendiumSource ?? s.flags?.core?.sourceId) === spellInfo.uuid,
			);
			if (alreadyPending) continue;

			try {
				const spell = (await fromUuid(spellInfo.uuid)) as NimbleBaseItem | null;
				if (!spell) continue;

				const spellSource: Item.Source = spell.toObject();
				spellSource._id = foundry.utils.randomID();
				spellSource._stats.compendiumSource = spellInfo.uuid;

				const tempSpell = new Item(foundry.utils.deepClone(spellSource), { parent: actor });
				tempSpell.grantedBy = this.item;

				tempItems.push(tempSpell);
				pendingItems.push(spellSource);
			} catch (err) {
				console.warn(`Nimble | Failed to grant spell ${spellInfo.uuid}:`, err);
			}
		}

		if (pendingItems.length > 0) {
			operation.keepId = true;
		}
	}

	/**
	 * Set the chosen schools and grant their spells
	 * Called from character creation dialog after player selection
	 */
	async setChosenSchools(schools: string[]): Promise<void> {
		if (schools.length > this.choiceCount) {
			console.warn(`Nimble | Too many schools selected (${schools.length} > ${this.choiceCount})`);
			return;
		}

		// Validate that chosen schools are valid options
		const validSchools = schools.filter((s) =>
			this.choiceOptions.map((o) => o.toLowerCase()).includes(s.toLowerCase()),
		);

		if (validSchools.length !== schools.length) {
			console.warn(`Nimble | Some selected schools are not valid options`);
		}

		// Update the rule with the chosen schools
		const rules = this.item.system.rules as Array<{ id: string; chosenSchools?: string[] }>;
		const ruleIndex = rules.findIndex((r) => r.id === this.id);
		if (ruleIndex === -1) return;

		const updates: Record<string, string[]> = {
			[`system.rules.${ruleIndex}.chosenSchools`]: validSchools,
		};

		await this.item.update(updates);

		// Grant spells from chosen schools
		const actor = this.actor as NimbleCharacter;
		if (!actor || actor.type !== 'character') return;

		const missingSpells = await getCharacterMissingSpells(actor, {
			schools: validSchools,
			maxTier: this.baseTier,
			utilityOnly: false,
			excludeUtility: this.excludeUtility,
		});

		const spellsToCreate: Item.Source[] = [];
		for (const spellInfo of missingSpells) {
			const alreadyHas = actor.items.some(
				(i) => i.type === 'spell' && (i.sourceId ?? i._stats?.compendiumSource) === spellInfo.uuid,
			);
			if (alreadyHas) continue;

			try {
				const spell = (await fromUuid(spellInfo.uuid)) as NimbleBaseItem | null;
				if (!spell) continue;

				const spellSource: Item.Source = spell.toObject();
				spellSource._id = foundry.utils.randomID();
				spellSource._stats.compendiumSource = spellInfo.uuid;

				spellsToCreate.push(spellSource);
			} catch (err) {
				console.warn(`Nimble | Failed to prepare spell ${spellInfo.uuid}:`, err);
			}
		}

		if (spellsToCreate.length > 0) {
			await actor.createEmbeddedDocuments('Item', spellsToCreate, { keepId: true });
		}
	}
}

export { SelectSpellSchoolRule };
