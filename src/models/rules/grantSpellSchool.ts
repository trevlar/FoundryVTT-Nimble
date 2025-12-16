import type { NimbleCharacter } from '../../documents/actor/character.js';
import type { NimbleBaseItem } from '../../documents/item/base.svelte.js';
import getCharacterMissingSpells from '../../utils/getCharacterMissingSpells.js';
import { RecordField } from '../fields/RecordField.js';
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

type RuleSource =
	| {
			type: 'selectSpellSchool';
			fixedSchools?: string[];
			chosenSchools?: string[];
	  }
	| {
			type: 'grantSpellSchool';
			schoolSource?: 'known' | 'specific';
			schools?: string[];
	  }
	| { type: string };

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
		type: new fields.StringField({ required: true, nullable: false, initial: 'grantSpellSchool' }),
		schoolSource: new fields.StringField({
			required: true,
			nullable: false,
			initial: 'specific',
			choices: ['known', 'specific'],
		}),
		schools: new fields.ArrayField(
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
		tierProgression: new RecordField(
			new fields.StringField({ required: true, nullable: false, initial: '' }),
			new fields.NumberField({ required: true, nullable: false, initial: 0, integer: true }),
		),
		utilityOnly: new fields.BooleanField({ required: true, nullable: false, initial: false }),
		excludeUtility: new fields.BooleanField({ required: true, nullable: false, initial: false }),
	};
}

declare namespace GrantSpellSchoolRule {
	type Schema = NimbleBaseRule.Schema & ReturnType<typeof schema>;
}

class GrantSpellSchoolRule extends NimbleBaseRule<GrantSpellSchoolRule.Schema> {
	static override defineSchema(): GrantSpellSchoolRule.Schema {
		return {
			...NimbleBaseRule.defineSchema(),
			...schema(),
		};
	}

	override tooltipInfo(): string {
		return super.tooltipInfo(
			new Map([
				['schoolSource', "'known' | 'specific'"],
				['schools', 'string[]'],
				['baseTier', 'number'],
				['tierProgression', 'Record<number, number>'],
				['utilityOnly', 'boolean'],
				['excludeUtility', 'boolean'],
			]),
		);
	}

	/**
	 * Get the schools this rule should grant.
	 * If schoolSource is "known", returns schools from actor's spellAccess.
	 * If schoolSource is "specific", returns the schools array from this rule.
	 */
	getSchools(): string[] {
		if (this.schoolSource === 'known') {
			const actor = this.actor as NimbleCharacter;
			if (!actor || actor.type !== 'character') return [];

			// Return schools already tracked in spellAccess
			const knownSchools = Object.keys(actor.system.spellAccess?.schools ?? {});
			return knownSchools;
		}

		return this.schools;
	}

	/**
	 * Get schools from tempItems being created at the same time.
	 * This handles the timing issue during character creation where spellAccess
	 * isn't populated yet but selectSpellSchool rules have already set their schools.
	 */
	private getSchoolsFromTempItems(tempItems: Array<Item.Source | Item>): string[] {
		const schools = new Set<string>();

		for (const tempItem of tempItems) {
			const system = (tempItem as { system?: { rules?: RuleSource[] } }).system;
			const rules = system?.rules ?? [];
			for (const rule of rules) {
				// Check selectSpellSchool rules
				if (rule.type === 'selectSpellSchool') {
					for (const s of rule.fixedSchools ?? []) {
						schools.add(s.toLowerCase());
					}
					for (const s of rule.chosenSchools ?? []) {
						schools.add(s.toLowerCase());
					}
				}
				// Check grantSpellSchool rules with specific schools
				if (rule.type === 'grantSpellSchool' && rule.schoolSource === 'specific') {
					for (const s of rule.schools ?? []) {
						schools.add(s.toLowerCase());
					}
				}
			}
		}

		return Array.from(schools);
	}

	/**
	 * Calculate the max tier available for a given character level
	 */
	getMaxTierForLevel(characterLevel: number): number {
		let maxTier = this.baseTier;

		// Check tier progression for higher tiers
		for (const [levelStr, tier] of Object.entries(this.tierProgression)) {
			const level = parseInt(levelStr, 10);
			if (characterLevel >= level && tier > maxTier) {
				maxTier = tier;
			}
		}

		return maxTier;
	}

	/**
	 * Update the character's spellAccess.schools after data prep
	 */
	override afterPrepareData(): void {
		if (this.disabled) return;

		const actor = this.actor as NimbleCharacter;
		if (!actor || actor.type !== 'character') return;

		// Skip updating spellAccess if we're using "known" schools
		// (we don't want to override the existing school entries)
		if (this.schoolSource === 'known') return;

		const characterLevel = actor.levels?.character ?? 1;
		const maxTier = this.getMaxTierForLevel(characterLevel);

		const spellAccess = getOrCreateSpellAccess(actor);

		// Update spellAccess.schools for each school this rule grants
		const schools = this.getSchools();
		for (const school of schools) {
			const schoolLower = school.toLowerCase();
			const currentMaxTier = spellAccess.schools[schoolLower] ?? -1;

			// Only update if this rule grants a higher tier
			if (maxTier > currentMaxTier) {
				spellAccess.schools[schoolLower] = maxTier;
			}
		}
	}

	/**
	 * Grant all matching spells when the feature containing this rule is added
	 */
	override async preCreate(args: RulePreCreateArgs): Promise<void> {
		if (this.disabled) return;

		const { pendingItems, operation, tempItems } = args;

		const actor = this.actor as NimbleCharacter;
		if (!actor || actor.type !== 'character') return;

		const characterLevel = actor.levels?.character ?? 1;
		const maxTier = this.getMaxTierForLevel(characterLevel);

		// Get the schools to grant spells from
		let schools = this.getSchools();

		// If using "known" schools and none found in spellAccess, check tempItems
		// This handles character creation where spellAccess isn't populated yet
		if (this.schoolSource === 'known' && schools.length === 0) {
			schools = this.getSchoolsFromTempItems(tempItems);
		}

		if (schools.length === 0) return;

		// Get spells the character is missing
		const missingSpells = await getCharacterMissingSpells(actor, {
			schools,
			maxTier,
			utilityOnly: this.utilityOnly,
			excludeUtility: this.excludeUtility,
		});

		// Grant each missing spell
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

				// Create a temporary item for data prep
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
}

export { GrantSpellSchoolRule };
