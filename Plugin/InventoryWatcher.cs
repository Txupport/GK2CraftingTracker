using System.Collections.Generic;
using System.IO;
using System.Reflection;
using HarmonyLib;
using Newtonsoft.Json;
using UnityEngine;

namespace GKTrackerBridge
{
    public class ItemStackDto
    {
        public string id;
        public int count;
    }

    public class ContainerDto
    {
        public string source;      // "player" | "toolbelt" | "wgo"
        public string wgoId;       // item/def id of the container, e.g. "chest_wood" (null for player/toolbelt)
        public string uid;         // SGuid string, for wgo containers
        public float x, y, z;      // world position, for wgo containers
        public string zoneId;      // the named area/zone the container sits in, e.g. "garden" (null if unknown)
        public List<ItemStackDto> items = new List<ItemStackDto>();
    }

    public class InventorySnapshotDto
    {
        public List<ContainerDto> containers = new List<ContainerDto>();
        public List<string> unlockedCraftIds = new List<string>();
        public List<string> oneTimeCompletedCraftIds = new List<string>();
        public List<string> builtWgoIds = new List<string>();
    }

    public static class InventoryWatcher
    {
        private static readonly FieldInfo GameSaveField = AccessTools.Field(typeof(MainGame), "gameSave");
        private static readonly FieldInfo WorldDataCacheField = AccessTools.Field(typeof(WorldData), "cache");

        public static void WriteSnapshot()
        {
            var snapshot = new InventorySnapshotDto();

            var pd = MainGame.PlayerData;
            if (pd != null)
            {
                AddContainer(snapshot.containers, "player", null, null, null, pd.inventory);
                AddContainer(snapshot.containers, "toolbelt", null, null, null, pd.toolBeltInventory);
            }

            var gameSave = MainGame.Instance != null ? GameSaveField.GetValue(MainGame.Instance) as GameSave : null;

            var ks = gameSave?.knowledgeSystem;
            if (ks != null)
            {
                if (ks.unlockedCrafts != null) snapshot.unlockedCraftIds.AddRange(ks.unlockedCrafts);
                if (ks.unlockedBuildings != null) snapshot.unlockedCraftIds.AddRange(ks.unlockedBuildings);
                if (ks.unlockedTownBuildings != null) snapshot.unlockedCraftIds.AddRange(ks.unlockedTownBuildings);

                if (ks.oneTimeCompletedCrafts != null) snapshot.oneTimeCompletedCraftIds.AddRange(ks.oneTimeCompletedCrafts);
            }

            var worldData = gameSave?.worldData;
            var cache = worldData != null ? WorldDataCacheField.GetValue(worldData) as WgoDataCache : null;
            var wgoDict = cache?.wgoDataByUidCache;
            if (wgoDict != null)
            {
                var builtSet = new HashSet<string>();
                foreach (var kv in wgoDict)
                {
                    var wgo = kv.Value;
                    if (wgo == null || string.IsNullOrEmpty(wgo.id)) continue;
                    builtSet.Add(wgo.id);

                    if (wgo.Inventory == null) continue;
                    if (wgo.Inventory.Data == null || wgo.Inventory.Data.Inventory == null || wgo.Inventory.Data.Inventory.Count == 0) continue;
                    AddContainer(snapshot.containers, "wgo", wgo.id, kv.Key.ToString(), wgo.Position, wgo.Inventory, wgo.WorldZoneData?.id);
                }
                snapshot.builtWgoIds.AddRange(builtSet);
            }

            var tmp = Path.Combine(TrackerPlugin.OutDir, "inventory.json.tmp");
            var final = Path.Combine(TrackerPlugin.OutDir, "inventory.json");
            File.WriteAllText(tmp, JsonConvert.SerializeObject(snapshot, Formatting.Indented));
            File.Copy(tmp, final, true);
            File.Delete(tmp);
        }

        private static void AddContainer(List<ContainerDto> into, string source, string wgoId, string uid, Vector3? pos, Inventory inv, string zoneId = null)
        {
            if (inv?.Data?.Inventory == null) return;

            var dto = new ContainerDto { source = source, wgoId = wgoId, uid = uid, zoneId = zoneId };
            if (pos.HasValue) { dto.x = pos.Value.x; dto.y = pos.Value.y; dto.z = pos.Value.z; }

            foreach (var item in inv.Data.Inventory)
            {
                if (item == null || string.IsNullOrEmpty(item.id) || item.Count <= 0) continue;
                dto.items.Add(new ItemStackDto { id = item.id, count = item.Count });
            }

            if (dto.items.Count > 0) into.Add(dto);
        }
    }
}
