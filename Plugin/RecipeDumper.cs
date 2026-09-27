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
            var itemsMap = new Dictionary<string, ItemDefDto>();
            if (gb.itemDefs != null)
            {
                foreach (var def in gb.itemDefs)
                {
                    if (def == null || string.IsNullOrEmpty(def.id)) continue;
                    itemsMap[def.id] = new ItemDefDto
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
                    };
                }
            }

            if (gb.wgoDefs != null)
            {
                foreach (var wgo in gb.wgoDefs)
                {
                    if (wgo == null || string.IsNullOrEmpty(wgo.id)) continue;
                    EnsureItemDef(itemsMap, wgo.id);
                }
            }

            var craftMap = new Dictionary<string, CraftDefDto>();

            if (gb.craftDefs != null)
            {
                foreach (var def in gb.craftDefs)
                {
                    if (def == null || string.IsNullOrEmpty(def.id)) continue;
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

                    craftMap[dto.id] = dto;
                }
            }

            if (gb.buildingDefs != null)
            {
                foreach (var bdef in gb.buildingDefs)
                {
                    if (bdef == null || string.IsNullOrEmpty(bdef.id)) continue;
                    if (craftMap.ContainsKey(bdef.id)) continue;

                    var dto = new CraftDefDto
                    {
                        id = bdef.id,
                        tabId = bdef.tab ?? "",
                        isNeedsUnlock = bdef.isNeedsUnlock
                    };
                    if (bdef.buildsIn != null) dto.craftsIn.AddRange(bdef.buildsIn);

                    if (bdef.needItems != null)
                    {
                        foreach (var need in bdef.needItems)
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

                    if (bdef.outputItems != null)
                    {
                        if (bdef.outputItems.chanceOutputItems != null)
                        {
                            foreach (var outItem in bdef.outputItems.chanceOutputItems)
                            {
                                if (outItem == null) continue;
                                AddChanceOutput(dto, outItem);
                            }
                        }
                        if (bdef.outputItems.groupChanceOutputItems != null)
                        {
                            foreach (var group in bdef.outputItems.groupChanceOutputItems)
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

                    if (dto.outputItems.Count == 0)
                    {
                        string outId = !string.IsNullOrEmpty(bdef.wgoId) ? bdef.wgoId : bdef.id;
                        dto.outputItems.Add(new OutputItemDto
                        {
                            itemId = outId,
                            outputGroupId = "",
                            count = 1,
                            chance = 1f
                        });
                        EnsureItemDef(itemsMap, outId);
                    }

                    craftMap[dto.id] = dto;
                }
            }

            if (gb.townBuildingDefs != null)
            {
                foreach (var tbdef in gb.townBuildingDefs)
                {
                    if (tbdef == null || string.IsNullOrEmpty(tbdef.id)) continue;
                    if (craftMap.ContainsKey(tbdef.id)) continue;

                    var dto = new CraftDefDto
                    {
                        id = tbdef.id,
                        tabId = "town",
                        isNeedsUnlock = tbdef.isNeedsUnlock
                    };
                    if (tbdef.craftsIn != null) dto.craftsIn.AddRange(tbdef.craftsIn);

                    if (tbdef.needItems != null)
                    {
                        foreach (var need in tbdef.needItems)
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

                    if (tbdef.dropItemsOnBuildingFinished != null && tbdef.dropItemsOnBuildingFinished.chanceOutputItems != null)
                    {
                        foreach (var outItem in tbdef.dropItemsOnBuildingFinished.chanceOutputItems)
                        {
                            if (outItem == null) continue;
                            AddChanceOutput(dto, outItem);
                        }
                    }

                    if (dto.outputItems.Count == 0)
                    {
                        dto.outputItems.Add(new OutputItemDto
                        {
                            itemId = tbdef.id,
                            outputGroupId = "",
                            count = 1,
                            chance = 1f
                        });
                        EnsureItemDef(itemsMap, tbdef.id);
                    }

                    craftMap[dto.id] = dto;
                }
            }

            var items = new List<ItemDefDto>(itemsMap.Values);
            var crafts = new List<CraftDefDto>(craftMap.Values);

            var payload = new { items, crafts };
            var json = JsonConvert.SerializeObject(payload, Formatting.Indented);
            File.WriteAllText(Path.Combine(TrackerPlugin.OutDir, "recipes.json"), json);
        }

        private static void EnsureItemDef(Dictionary<string, ItemDefDto> itemsMap, string id)
        {
            if (string.IsNullOrEmpty(id) || itemsMap.ContainsKey(id)) return;
            itemsMap[id] = new ItemDefDto
            {
                id = id,
                displayName = ResolveDisplayName(id),
                type = "Building",
                inventorySize = 0,
                isSeed = false,
                isFertilizer = false,
                isBag = false,
                isTool = false,
                isProduct = false
            };
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
            catch { }
        }

        internal static string DebugResolveDisplayName(string itemId) => ResolveDisplayName(itemId);

        private static string ResolveDisplayName(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            try
            {
                foreach (var prefix in new[] { "i_", "b_", "wgo_", "const_", "building_", "" })
                {
                    var key = prefix + id;
                    if (LLBase.HasL(key))
                    {
                        var value = LLBase.L(key);
                        if (!string.IsNullOrEmpty(value)) return value;
                    }
                }
            }
            catch { }
            return null;
        }
    }
}
