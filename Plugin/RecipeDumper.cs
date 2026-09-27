using System.Collections.Generic;
using System.IO;
using LazyBearTechnology;
using Newtonsoft.Json;

namespace GKTrackerBridge
{
    public class ItemDefDto
    {
        public string id;
        public string displayName;
        public string type;
        public int inventorySize;
        public bool isSeed;
        public bool isFertilizer;
        public bool isBag;
        public bool isTool;
        public bool isProduct;
    }

    public class NeedItemDto
    {
        public string itemId;
        public string groupType;
        public int count;
    }

    public class OutputItemDto
    {
        public string itemId;
        public string outputGroupId;
        public int count;
        public float chance;
    }

    public class CraftDefDto
    {
        public string id;
        public string tabId;
        public bool isNeedsUnlock;
        public List<string> craftsIn = new List<string>();
        public List<NeedItemDto> needItems = new List<NeedItemDto>();
        public List<OutputItemDto> outputItems = new List<OutputItemDto>();
    }

    public static class RecipeDumper
    {
        public static void DumpAll(GameBalance gb)
        {
            var items = new List<ItemDefDto>();
            foreach (var def in gb.itemDefs)
            {
                if (def == null) continue;
                items.Add(new ItemDefDto
                {
                    id = def.id,
                    displayName = ResolveDisplayName(def.id),
                    type = def.type.ToString(),
                    inventorySize = def.inventorySize,
                    isSeed = def.isSeed,
                    isFertilizer = def.isFertilizer,
                    isBag = def.isBag,
                    isTool = def.isTool,
                    isProduct = def.isProduct,
                });
            }

            var crafts = new List<CraftDefDto>();
            foreach (var def in gb.craftDefs)
            {
                if (def == null) continue;
                var dto = new CraftDefDto { id = def.id, tabId = def.tabId, isNeedsUnlock = def.isNeedsUnlock };
                if (def.craftsIn != null) dto.craftsIn.AddRange(def.craftsIn);

                if (def.needItems != null)
                {
                    foreach (var need in def.needItems)
                    {
                        if (need == null) continue;
                        int count = 1;
                        SafeEval(() => count = need.count?.EvaluateInt() ?? 1);
                        dto.needItems.Add(new NeedItemDto
                        {
                            itemId = need.id,
                            groupType = need.groupType.ToString(),
                            count = count,
                        });
                    }
                }

                if (def.outputItems != null)
                {
                    if (def.outputItems.chanceOutputItems != null)
                    {
                        foreach (var outItem in def.outputItems.chanceOutputItems)
                        {
                            if (outItem == null) continue;
                            AddChanceOutput(dto, outItem);
                        }
                    }
                    if (def.outputItems.groupChanceOutputItems != null)
                    {
                        foreach (var group in def.outputItems.groupChanceOutputItems)
                        {
                            if (group?.chanceItems == null) continue;
                            foreach (var outItem in group.chanceItems)
                            {
                                if (outItem == null) continue;
                                AddChanceOutput(dto, outItem);
                            }
                        }
                    }
                }

                crafts.Add(dto);
            }

            var payload = new { items, crafts };
            var json = JsonConvert.SerializeObject(payload, Formatting.Indented);
            File.WriteAllText(Path.Combine(TrackerPlugin.OutDir, "recipes.json"), json);
        }

        private static void AddChanceOutput(CraftDefDto dto, ChanceOutputItem outItem)
        {
            int count = 1;
            float chance = 1f;
            SafeEval(() => count = outItem.count?.EvaluateInt() ?? 1);
            SafeEval(() => chance = outItem.chance?.EvaluateFloat() ?? 1f);
            dto.outputItems.Add(new OutputItemDto
            {
                itemId = outItem.id,
                outputGroupId = outItem.outputGroupId,
                count = count,
                chance = chance,
            });
        }

        private static void SafeEval(System.Action action)
        {
            try { action(); }
            catch { /* some expressions need live combat/wgo context we don't have at dump time; default stands */ }
        }

        // Item ids don't reliably tell you display word order (e.g. "nails_bronze" needs
        // to read "Bronze Nails"), so pull the real localized name from the game's own
        // string table via LLBase.L, keyed the same way the game's own UI does (observed
        // as "i_" + id from raw string scans of the game's asset data). Falls back to
        // null (client prettifies the raw id) if no such key exists.
        internal static string DebugResolveDisplayName(string itemId) => ResolveDisplayName(itemId);

        private static string ResolveDisplayName(string itemId)
        {
            if (string.IsNullOrEmpty(itemId)) return null;
            try
            {
                var key = "i_" + itemId;
                if (LLBase.HasL(key))
                {
                    var value = LLBase.L(key);
                    if (!string.IsNullOrEmpty(value)) return value;
                }
                if (LLBase.HasL(itemId))
                {
                    var value = LLBase.L(itemId);
                    if (!string.IsNullOrEmpty(value)) return value;
                }
            }
            catch { /* localization not ready yet or key format unexpected; fall back client-side */ }
            return null;
        }
    }
}
