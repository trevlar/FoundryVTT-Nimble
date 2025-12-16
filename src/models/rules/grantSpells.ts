import type { NimbleBaseItem } from '../../documents/item/base.svelte.js';
import { NimbleBaseRule } from './base.js';

function schema() {
	const { fields } = foundry.data;

	return {
		type: new fields.StringField({ required: true, nullable: false, initial: 'grantSpells' }),
		spellUuids: new fields.ArrayField(
			new fields.StringField({ required: true, nullable: false, initial: '' }),
			{ required: true, nullable: false, initial: [] },
		),
	};
}

declare namespace GrantSpellsRule {
	type Schema = NimbleBaseRule.Schema & ReturnType<typeof schema>;
}

/**
 * Rule that grants specific spells by UUID when the feature is added.
 * Used for features like Shadowmancer's Conduit of Shadow that grant
 * specific spells rather than entire spell schools.
 */
class GrantSpellsRule extends NimbleBaseRule<GrantSpellsRule.Schema> {
	static override defineSchema(): GrantSpellsRule.Schema {
		return {
			...NimbleBaseRule.defineSchema(),
			...schema(),
		};
	}

	override tooltipInfo(): string {
		return super.tooltipInfo(new Map([['spellUuids', 'string[]']]));
	}

	/**
	 * Check if the actor already has a spell (by compendium source)
	 */
	private actorHasSpell(actor: NimbleCharacterActor, spellUuid: string): boolean {
		for (const item of actor.items) {
			if (item.type === 'spell') {
				const sourceId = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
				if (sourceId === spellUuid) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Grant the specified spells when the feature containing this rule is added
	 */
	override async preCreate(args): Promise<void> {
		if (this.disabled) return;

		const { pendingItems, operation, tempItems } = args;

		const actor = this.actor as NimbleCharacterActor;
		if (!actor || actor.type !== 'character') return;

		if (!this.spellUuids || this.spellUuids.length === 0) return;

		// Grant each spell that the actor doesn't already have
		for (const spellUuid of this.spellUuids) {
			if (!spellUuid) continue;

			// Skip if actor already has this spell
			if (this.actorHasSpell(actor, spellUuid)) continue;

			try {
				const spell = (await fromUuid(spellUuid)) as NimbleBaseItem | null;
				if (!spell) {
					console.warn(`Nimble | Could not find spell: ${spellUuid}`);
					continue;
				}

				const spellSource = spell.toObject();
				spellSource._id = foundry.utils.randomID();
				spellSource._stats.compendiumSource = spellUuid;

				// Create a temporary item for data prep
				const tempSpell = new Item(foundry.utils.deepClone(spellSource), { parent: actor });
				tempSpell.grantedBy = this.item;

				tempItems.push(tempSpell);
				pendingItems.push(spellSource);
			} catch (err) {
				console.warn(`Nimble | Failed to grant spell ${spellUuid}:`, err);
			}
		}

		if (pendingItems.length > 0) {
			operation.keepId = true;
		}
	}
}

export { GrantSpellsRule };
