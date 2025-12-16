/**
 * Get class features from compendiums that belong to specified groups
 * @param groupIdentifiers - Array of group identifiers to match
 * @param maxLevel - Maximum level for features (null = level 1 features only)
 * @returns Array of feature UUIDs
 */
export default async function getClassFeaturesByGroup(
	groupIdentifiers: string[],
	maxLevel: number | null = null,
): Promise<string[]> {
	const featureUuids: string[] = [];
	const groupSet = new Set(groupIdentifiers);

	console.log(
		'[getClassFeaturesByGroup] Called with groups:',
		groupIdentifiers,
		'maxLevel:',
		maxLevel,
	);

	for (const pack of game.packs) {
		for (const indexEntry of pack.index) {
			if (indexEntry.type !== 'feature') continue;

			// Need to load the full document to check group and level
			try {
				const document = (await pack.getDocument(indexEntry._id)) as NimbleFeatureItem | null;
				if (!document) continue;

				const featureGroup = document.system.group;
				const featureLevel = document.system.level;

				// Check if this feature belongs to one of the specified groups
				if (!groupSet.has(featureGroup)) continue;

				console.log(
					'[getClassFeaturesByGroup] Feature:',
					document.name,
					'- group:',
					featureGroup,
					'- level:',
					featureLevel,
				);

				// Filter by level:
				// - If maxLevel is null, only include features with level null (level 1 features)
				// - If maxLevel is a number, include features with level null OR level <= maxLevel
				if (maxLevel === null) {
					if (featureLevel !== null) {
						console.log(
							'[getClassFeaturesByGroup] SKIPPING',
							document.name,
							'- has level',
							featureLevel,
							'but maxLevel is null',
						);
						continue;
					}
				} else {
					if (featureLevel !== null && featureLevel > maxLevel) {
						console.log(
							'[getClassFeaturesByGroup] SKIPPING',
							document.name,
							'- level',
							featureLevel,
							'> maxLevel',
							maxLevel,
						);
						continue;
					}
				}

				console.log('[getClassFeaturesByGroup] INCLUDING', document.name);
				featureUuids.push(indexEntry.uuid);
			} catch (err) {
				console.warn(`Nimble | Failed to load feature ${indexEntry.uuid}:`, err);
			}
		}
	}

	console.log('[getClassFeaturesByGroup] Final UUIDs:', featureUuids.length);
	return featureUuids;
}
