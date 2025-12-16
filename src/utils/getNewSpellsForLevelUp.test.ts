import { describe, expect, it, vi } from 'vitest';

import getCharacterMissingSpells from './getCharacterMissingSpells.js';
import getNewSpellsForLevelUp from './getNewSpellsForLevelUp.js';

vi.mock('./getCharacterMissingSpells.js', () => ({
	default: vi.fn(),
}));

interface TestSpellInfo {
	uuid: string;
	name: string;
	img: string;
	school: string;
	tier: number;
	isUtility: boolean;
}

interface TestGetMissingSpellsOptions {
	schools: string[];
	maxTier: number;
	utilityOnly: boolean;
	excludeUtility: boolean;
}

function makeMockMissingSpells(allSpells: TestSpellInfo[]) {
	return async (_actor: NimbleCharacterActor, options: TestGetMissingSpellsOptions) => {
		const requestedSchools = new Set(options.schools.map((s) => s.toLowerCase()));
		return allSpells.filter((s) => {
			if (!requestedSchools.has(s.school.toLowerCase())) return false;
			if (s.tier > options.maxTier) return false;
			if (options.utilityOnly && !s.isUtility) return false;
			if (options.excludeUtility && s.isUtility) return false;
			return true;
		});
	};
}

describe('getNewSpellsForLevelUp', () => {
	it('treats a grantSpellSchool rule as inactive before the feature required level (tier 1 unlock at level 2)', async () => {
		const allSpells: TestSpellInfo[] = [
			{ uuid: 'uuid-t1', name: 'Tier 1 Spell', img: '', school: 'fire', tier: 1, isUtility: false },
			{ uuid: 'uuid-t2', name: 'Tier 2 Spell', img: '', school: 'fire', tier: 2, isUtility: false },
		];

		vi.mocked(getCharacterMissingSpells).mockImplementation(makeMockMissingSpells(allSpells));

		const actor = {
			type: 'character',
			levels: { character: 1 },
			system: { spellAccess: { schools: {} } },
			items: [
				{
					name: 'Mana and Unlock Tier 1 Spells',
					system: {
						level: 2,
						rules: [
							{
								type: 'grantSpellSchool',
								id: 'mage-tiered-spells',
								schoolSource: 'specific',
								schools: ['fire'],
								baseTier: 1,
								tierProgression: { 2: 1, 4: 2 },
								utilityOnly: false,
								excludeUtility: true,
							},
						],
					},
				},
			],
		} as NimbleCharacterActor;

		const result = await getNewSpellsForLevelUp(actor, 2);

		expect(result).toHaveLength(1);
		expect(result[0].ruleId).toBe('mage-tiered-spells');
		expect(result[0].spells.map((s) => s.uuid)).toEqual(['uuid-t1']);
	});

	it('detects newly unlocked tiers after the feature is active (tier 2 unlock at level 4)', async () => {
		const allSpells: TestSpellInfo[] = [
			{ uuid: 'uuid-t1', name: 'Tier 1 Spell', img: '', school: 'fire', tier: 1, isUtility: false },
			{ uuid: 'uuid-t2', name: 'Tier 2 Spell', img: '', school: 'fire', tier: 2, isUtility: false },
		];

		vi.mocked(getCharacterMissingSpells).mockImplementation(makeMockMissingSpells(allSpells));

		const actor = {
			type: 'character',
			levels: { character: 3 },
			system: { spellAccess: { schools: {} } },
			items: [
				{
					name: 'Mana and Unlock Tier 1 Spells',
					system: {
						level: 2,
						rules: [
							{
								type: 'grantSpellSchool',
								id: 'mage-tiered-spells',
								schoolSource: 'specific',
								schools: ['fire'],
								baseTier: 1,
								tierProgression: { 2: 1, 4: 2 },
								utilityOnly: false,
								excludeUtility: true,
							},
						],
					},
				},
			],
		} as NimbleCharacterActor;

		const result = await getNewSpellsForLevelUp(actor, 4);

		expect(result).toHaveLength(1);
		expect(result[0].spells.map((s) => s.uuid)).toEqual(['uuid-t2']);
	});

	it('returns tier 0 spells when a baseTier 0 feature becomes active (currentMaxTier must be -1)', async () => {
		const allSpells: TestSpellInfo[] = [
			{ uuid: 'uuid-t0', name: 'Cantrip', img: '', school: 'wind', tier: 0, isUtility: false },
			{ uuid: 'uuid-t1', name: 'Tier 1 Spell', img: '', school: 'wind', tier: 1, isUtility: false },
		];

		vi.mocked(getCharacterMissingSpells).mockImplementation(makeMockMissingSpells(allSpells));

		const actor = {
			type: 'character',
			levels: { character: 1 },
			system: { spellAccess: { schools: {} } },
			items: [
				{
					name: 'Some Cantrip Feature',
					system: {
						level: 2,
						rules: [
							{
								type: 'grantSpellSchool',
								id: 'cantrip-unlock',
								schoolSource: 'specific',
								schools: ['wind'],
								baseTier: 0,
								tierProgression: {},
								utilityOnly: false,
								excludeUtility: true,
							},
						],
					},
				},
			],
		} as NimbleCharacterActor;

		const result = await getNewSpellsForLevelUp(actor, 2);

		expect(result).toHaveLength(1);
		expect(result[0].spells.map((s) => s.uuid)).toEqual(['uuid-t0']);
	});
});
