export interface SpellInfo {
	uuid: string;
	name: string;
	img: string;
	school: string;
	tier: number;
	isUtility: boolean;
}

export interface GetSpellsOptions {
	schools: string[];
	maxTier: number;
	utilityOnly?: boolean;
	excludeUtility?: boolean;
	/**
	 * If provided, restrict results to spells that are either:
	 * - unrestricted (no `restrictedClasses`), or
	 * - restricted to a class present in this list.
	 */
	allowedClasses?: string[];
}

/**
 * Get all available spells filtered by schools and tier
 * @param options - Filter options for schools, max tier, and utility type
 * @returns Array of spell info objects
 */
export default async function getSpellsBySchoolAndTier(
	options: GetSpellsOptions,
): Promise<SpellInfo[]> {
	const { schools, maxTier, utilityOnly = false, excludeUtility = false, allowedClasses } = options;
	const spells: SpellInfo[] = [];
	const schoolSet = new Set(schools.map((s) => s.toLowerCase()));
	const allowedClassSet =
		allowedClasses && allowedClasses.length > 0
			? new Set(allowedClasses.map((c) => c.toLowerCase()))
			: null;

	const isAllowedForClasses = (restrictedClasses: string[] | undefined): boolean => {
		if (!restrictedClasses || restrictedClasses.length === 0) return true;
		if (!allowedClassSet) return false;
		return restrictedClasses.some((c) => allowedClassSet.has(c.toLowerCase()));
	};

	// Get spells from world items
	for (const item of game.items) {
		if (item.type !== 'spell') continue;

		const spell = item as NimbleSpellItem;
		const school = spell.system.school?.toLowerCase() ?? '';
		const tier = spell.system.tier ?? 0;
		const isUtility = spell.system.properties?.selected?.includes('utilitySpell') ?? false;
		const restrictedClasses = (spell.system as { restrictedClasses?: string[] }).restrictedClasses;

		// Filter by school
		if (!schoolSet.has(school)) continue;

		// Filter by tier
		if (tier > maxTier) continue;

		// Filter by utility type
		if (utilityOnly && !isUtility) continue;
		if (excludeUtility && isUtility) continue;

		// Filter by class restriction
		if (!isAllowedForClasses(restrictedClasses)) continue;

		spells.push({
			uuid: item.uuid,
			name: item.name,
			img: item.img ?? 'icons/svg/explosion.svg',
			school,
			tier,
			isUtility,
		});
	}

	// Get spells from compendiums
	for (const pack of game.packs) {
		const index = pack.index;

		for (const indexEntry of index) {
			if (indexEntry.type !== 'spell') continue;

			// Need to load the full document to check school and tier
			try {
				const document = (await pack.getDocument(indexEntry._id)) as NimbleSpellItem | null;
				if (!document) continue;

				const school = document.system.school?.toLowerCase() ?? '';
				const tier = document.system.tier ?? 0;
				const isUtility = document.system.properties?.selected?.includes('utilitySpell') ?? false;
				const restrictedClasses = (document.system as { restrictedClasses?: string[] })
					.restrictedClasses;

				// Filter by school
				if (!schoolSet.has(school)) continue;

				// Filter by tier
				if (tier > maxTier) continue;

				// Filter by utility type
				if (utilityOnly && !isUtility) continue;
				if (excludeUtility && isUtility) continue;

				// Filter by class restriction
				if (!isAllowedForClasses(restrictedClasses)) continue;

				spells.push({
					uuid: indexEntry.uuid,
					name: indexEntry.name,
					img: indexEntry.img ?? 'icons/svg/explosion.svg',
					school,
					tier,
					isUtility,
				});
			} catch (err) {
				console.warn(`Nimble | Failed to load spell ${indexEntry.uuid}:`, err);
			}
		}
	}

	// Sort by tier, then by name
	return spells.sort((a, b) => {
		if (a.tier !== b.tier) return a.tier - b.tier;
		return a.name.localeCompare(b.name);
	});
}
