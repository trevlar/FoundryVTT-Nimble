<script lang="ts">
	import getNewSpellsForLevelUp from '../../../../utils/getNewSpellsForLevelUp.js';

	let { document, levelingTo } = $props();

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

	interface NewSpellsResult {
		spells: SpellInfo[];
		sourceFeature: string;
		ruleId: string;
	}

	let newSpells: NewSpellsResult[] = $state([]);
	let expanded: Record<string, boolean> = $state({});
	let isLoading = $state(true);

	$effect(() => {
		if (document && levelingTo) {
			isLoading = true;
			getNewSpellsForLevelUp(document, levelingTo).then((results) => {
				newSpells = results;
				// Start with all sections expanded
				expanded = Object.fromEntries(results.map((r) => [r.ruleId, true]));
				isLoading = false;
			});
		}
	});

	function toggleExpanded(ruleId: string) {
		expanded = { ...expanded, [ruleId]: !expanded[ruleId] };
	}

	let totalSpellCount = $derived(newSpells.reduce((sum, r) => sum + r.spells.length, 0));
</script>

{#if isLoading}
	<section class="nimble-level-up-section">
		<header class="nimble-section-header">
			<h3 class="nimble-heading" data-heading-variant="section">
				<i class="fa-solid fa-spinner fa-spin"></i>
				Loading spell unlocks...
			</h3>
		</header>
	</section>
{:else if newSpells.length > 0}
	<section class="nimble-level-up-section nimble-spell-unlock">
		<header class="nimble-section-header">
			<h3 class="nimble-heading" data-heading-variant="section">
				<i class="fa-solid fa-wand-magic-sparkles"></i>
				New Spells Unlocked ({totalSpellCount})
			</h3>
		</header>

		<p class="nimble-spell-unlock__description">
			The following spells will be automatically added to your character:
		</p>

		{#each newSpells as spellGroup (spellGroup.ruleId)}
			<div class="nimble-spell-unlock__group">
				<button
					class="nimble-spell-unlock__group-header"
					onclick={() => toggleExpanded(spellGroup.ruleId)}
					aria-expanded={expanded[spellGroup.ruleId]}
				>
					<span class="nimble-spell-unlock__group-title">
						{spellGroup.sourceFeature}
						<span class="nimble-spell-unlock__count">({spellGroup.spells.length} spells)</span>
					</span>
					<i
						class="fa-solid fa-chevron-down nimble-spell-unlock__chevron"
						class:expanded={expanded[spellGroup.ruleId]}
					></i>
				</button>

				{#if expanded[spellGroup.ruleId]}
					<ul class="nimble-spell-unlock__list">
						{#each spellGroup.spells as spell (spell.uuid)}
							<li class="nimble-spell-unlock__item">
								<img class="nimble-spell-unlock__img" src={spell.img} alt={spell.name} />
								<div class="nimble-spell-unlock__info">
									<span class="nimble-spell-unlock__name">{spell.name}</span>
									<span class="nimble-spell-unlock__meta">
										{schoolLabels[spell.school] || spell.school}
										{#if spell.tier > 0}
											• Tier {spell.tier}
										{:else}
											• Cantrip
										{/if}
										{#if spell.isUtility}
											• Utility
										{/if}
									</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/each}
	</section>
{/if}

<style lang="scss">
	.nimble-spell-unlock {
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

		&__list {
			list-style: none;
			padding: 0;
			margin: 0;
		}

		&__item {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.5rem 1rem;
			border-bottom: 1px solid var(--nimble-border-color);

			&:last-child {
				border-bottom: none;
			}
		}

		&__img {
			width: 2rem;
			height: 2rem;
			border-radius: var(--nimble-border-radius);
			object-fit: cover;
		}

		&__info {
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
	}
</style>
