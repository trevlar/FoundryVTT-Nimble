<script lang="ts">
	import getNewSpellChoicesForLevelUp from '../../../../utils/getNewSpellChoicesForLevelUp.js';
	import getSpellsBySchoolAndTier from '../../../../utils/getSpellsBySchoolAndTier.js';

	let { document, levelingTo, spellChoiceSelections = $bindable({}) } = $props();

	// School display names
	const schoolLabels: Record<string, string> = {
		fire: 'Fire',
		ice: 'Ice',
		lightning: 'Lightning',
		wind: 'Wind',
		radiant: 'Radiant',
		necrotic: 'Necrotic',
	};

	interface SpellInfo {
		uuid: string;
		name: string;
		img: string;
		school: string;
		tier: number;
		isUtility: boolean;
	}

	interface SpellChoiceInfo {
		ruleId: string;
		sourceFeature: string;
		sourceItemId: string;
		label: string;
		spellType: 'utility' | 'tiered' | 'any';
		schoolSource: 'known' | 'specific' | 'any';
		schools: string[];
		maxTier: number;
		newChoiceCount: number;
		totalChoiceCount: number;
		currentSelections: string[];
	}

	let spellChoices: SpellChoiceInfo[] = $state([]);
	let availableSpells: Record<string, SpellInfo[]> = $state({});
	let expanded: Record<string, boolean> = $state({});
	let isLoading = $state(true);

	$effect(() => {
		if (document && levelingTo) {
			isLoading = true;
			const choices = getNewSpellChoicesForLevelUp(document, levelingTo);
			spellChoices = choices;

			// Start with all sections expanded
			expanded = Object.fromEntries(choices.map((c) => [c.ruleId, true]));

			// Load available spells for each choice
			Promise.all(
				choices.map(async (choice) => {
					const spells = await loadAvailableSpells(choice);
					return { ruleId: choice.ruleId, spells };
				}),
			).then((results) => {
				availableSpells = Object.fromEntries(results.map((r) => [r.ruleId, r.spells]));
				isLoading = false;
			});
		}
	});

	async function loadAvailableSpells(choice: SpellChoiceInfo): Promise<SpellInfo[]> {
		let schools: string[];

		switch (choice.schoolSource) {
			case 'known':
				schools = Object.keys(document.system.spellAccess?.schools ?? {});
				break;
			case 'specific':
				schools = choice.schools ?? [];
				break;
			case 'any':
			default:
				schools = ['fire', 'ice', 'lightning', 'wind', 'radiant', 'necrotic'];
		}

		if (schools.length === 0) return [];

		return getSpellsBySchoolAndTier({
			schools,
			maxTier: choice.maxTier ?? 9,
			utilityOnly: choice.spellType === 'utility',
			excludeUtility: choice.spellType === 'tiered',
		});
	}

	function toggleExpanded(ruleId: string) {
		expanded = { ...expanded, [ruleId]: !expanded[ruleId] };
	}

	function handleSpellSelect(ruleId: string, spell: SpellInfo) {
		const choice = spellChoices.find((c) => c.ruleId === ruleId);
		if (!choice) return;

		const current = spellChoiceSelections[ruleId] ?? [];
		const isSelected = current.some((s: SpellInfo) => s.uuid === spell.uuid);

		// Calculate how many more can be selected (total allowed minus already selected on character)
		const slotsAvailable = choice.totalChoiceCount - choice.currentSelections.length;

		if (isSelected) {
			// Remove selection
			spellChoiceSelections = {
				...spellChoiceSelections,
				[ruleId]: current.filter((s: SpellInfo) => s.uuid !== spell.uuid),
			};
		} else if (current.length < slotsAvailable) {
			// Add selection
			spellChoiceSelections = {
				...spellChoiceSelections,
				[ruleId]: [...current, spell],
			};
		}
	}

	// Check if spell is already owned by the character
	function isSpellOwned(spellUuid: string): boolean {
		for (const item of document.items) {
			if (item.type === 'spell' && item.flags?.core?.sourceId === spellUuid) {
				return true;
			}
		}
		return false;
	}

	let totalPendingChoices = $derived(
		spellChoices.reduce((sum, c) => sum + (c.totalChoiceCount - c.currentSelections.length), 0),
	);

	let totalSelected = $derived(
		Object.values(spellChoiceSelections).reduce((sum, arr) => sum + (arr as SpellInfo[]).length, 0),
	);

	export function isComplete(): boolean {
		for (const choice of spellChoices) {
			const slotsAvailable = choice.totalChoiceCount - choice.currentSelections.length;
			const selections = spellChoiceSelections[choice.ruleId] ?? [];
			if (selections.length < slotsAvailable) {
				return false;
			}
		}
		return true;
	}
</script>

{#if isLoading}
	<section class="nimble-level-up-section">
		<header class="nimble-section-header">
			<h3 class="nimble-heading" data-heading-variant="section">
				<i class="fa-solid fa-spinner fa-spin"></i>
				Loading spell choices...
			</h3>
		</header>
	</section>
{:else if spellChoices.length > 0}
	<section class="nimble-level-up-section nimble-spell-choice">
		<header class="nimble-section-header">
			<h3 class="nimble-heading" data-heading-variant="section">
				<i class="fa-solid fa-hand-sparkles"></i>
				Spell Choices ({totalSelected}/{totalPendingChoices})
			</h3>
		</header>

		<p class="nimble-spell-choice__description">
			Your features grant you the ability to choose new spells:
		</p>

		{#each spellChoices as choice (choice.ruleId)}
			{@const slotsAvailable = choice.totalChoiceCount - choice.currentSelections.length}
			{@const currentSelections = spellChoiceSelections[choice.ruleId] ?? []}
			{@const spells = availableSpells[choice.ruleId] ?? []}

			<div class="nimble-spell-choice__group">
				<button
					class="nimble-spell-choice__group-header"
					onclick={() => toggleExpanded(choice.ruleId)}
					aria-expanded={expanded[choice.ruleId]}
				>
					<span class="nimble-spell-choice__group-title">
						{choice.sourceFeature}
						<span class="nimble-spell-choice__count"
							>(Select {slotsAvailable}
							{choice.spellType === 'utility' ? 'utility ' : ''}spell{slotsAvailable > 1
								? 's'
								: ''})</span
						>
					</span>
					<i
						class="fa-solid fa-chevron-down nimble-spell-choice__chevron"
						class:expanded={expanded[choice.ruleId]}
					></i>
				</button>

				{#if expanded[choice.ruleId]}
					<div class="nimble-spell-choice__content">
						<p class="nimble-spell-choice__info">
							{#if choice.schoolSource === 'known'}
								Choose from your known schools
							{:else if choice.schoolSource === 'specific'}
								Choose from {choice.schools?.map((s) => schoolLabels[s] || s).join(', ')}
							{:else}
								Choose from any school
							{/if}
							{#if choice.maxTier < 9}
								(up to tier {choice.maxTier})
							{/if}
						</p>

						{#if spells.length === 0}
							<p class="nimble-spell-choice__empty">No spells available for selection.</p>
						{:else}
							<ul class="nimble-spell-choice__list">
								{#each spells as spell (spell.uuid)}
									{@const isSelected = currentSelections.some(
										(s: SpellInfo) => s.uuid === spell.uuid,
									)}
									{@const isOwned = isSpellOwned(spell.uuid)}
									{@const isDisabled =
										isOwned || (!isSelected && currentSelections.length >= slotsAvailable)}
									<li class="nimble-spell-choice__item">
										<button
											class="nimble-spell-card"
											class:selected={isSelected}
											class:owned={isOwned}
											disabled={isDisabled}
											onclick={() => handleSpellSelect(choice.ruleId, spell)}
										>
											<img class="nimble-spell-card__img" src={spell.img} alt={spell.name} />
											<div class="nimble-spell-card__content">
												<span class="nimble-spell-card__name">{spell.name}</span>
												<span class="nimble-spell-card__meta">
													{schoolLabels[spell.school] || spell.school}
													{#if spell.tier > 0}
														• Tier {spell.tier}
													{:else}
														• Cantrip
													{/if}
													{#if spell.isUtility}
														• Utility
													{/if}
													{#if isOwned}
														• Already owned
													{/if}
												</span>
											</div>
											{#if isSelected}
												<i class="fa-solid fa-check nimble-spell-card__check"></i>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</section>
{/if}

<style lang="scss">
	.nimble-spell-choice {
		margin-block: 1rem;

		&__description {
			font-size: var(--nimble-sm-text);
			color: var(--nimble-text-secondary);
			margin-block: 0.5rem;
		}

		&__group {
			background: var(--nimble-surface-2);
			border-radius: var(--nimble-border-radius);
			margin-block: 0.5rem;
			overflow: hidden;
		}

		&__group-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			padding: 0.75rem 1rem;
			background: var(--nimble-surface-3);
			border: none;
			cursor: pointer;
			text-align: left;
			font-weight: 600;
			color: var(--nimble-text-primary);

			&:hover {
				background: var(--nimble-surface-4);
			}
		}

		&__group-title {
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}

		&__count {
			font-weight: normal;
			font-size: var(--nimble-sm-text);
			color: var(--nimble-text-secondary);
		}

		&__chevron {
			transition: transform 0.2s ease;

			&.expanded {
				transform: rotate(180deg);
			}
		}

		&__content {
			padding: 1rem;
		}

		&__info {
			font-size: var(--nimble-sm-text);
			color: var(--nimble-text-secondary);
			margin-block: 0 0.75rem;
		}

		&__empty {
			font-style: italic;
			color: var(--nimble-text-secondary);
		}

		&__list {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
			gap: 0.5rem;
			list-style: none;
			padding: 0;
			margin: 0;
			max-height: 300px;
			overflow-y: auto;
		}

		&__item {
			display: contents;
		}
	}

	.nimble-spell-card {
		display: grid;
		grid-template-columns: 2.5rem 1fr auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		border: 2px solid var(--nimble-border-color);
		border-radius: var(--nimble-border-radius);
		background: var(--nimble-surface-1);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;

		&:hover:not(:disabled) {
			border-color: var(--nimble-accent-color);
		}

		&.selected {
			border-color: var(--nimble-accent-color);
			background: color-mix(in srgb, var(--nimble-accent-color) 10%, var(--nimble-surface-1));
		}

		&.owned {
			opacity: 0.5;
			border-style: dashed;
		}

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		&__img {
			width: 2.5rem;
			height: 2.5rem;
			border-radius: var(--nimble-border-radius);
			object-fit: cover;
		}

		&__content {
			display: flex;
			flex-direction: column;
			gap: 0.125rem;
		}

		&__name {
			font-weight: 500;
		}

		&__meta {
			font-size: var(--nimble-sm-text);
			color: var(--nimble-text-secondary);
		}

		&__check {
			color: var(--nimble-accent-color);
			font-size: 1rem;
		}
	}
</style>
