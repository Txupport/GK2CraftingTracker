using System;
using System.IO;
using System.Reflection;
using BepInEx;
using BepInEx.Logging;
using HarmonyLib;
using UnityEngine;

namespace GKTrackerBridge
{
    [BepInPlugin("txupport.gk2trackerbridge", "GK2 Tracker Bridge", "1.0.0")]
    public class TrackerPlugin : BaseUnityPlugin
    {
        internal static ManualLogSource Log;
        internal static string OutDir;

        private Harmony _harmony;
        private int _lastDumpedCraftCount = -1;
        private float _inventoryTimer;
        private const float InventoryPollSeconds = 1f;

        private void Awake()
        {
            Log = Logger;
            OutDir = Path.Combine(Paths.GameRootPath, "GKTrackerBridge");
            Directory.CreateDirectory(OutDir);

            _harmony = new Harmony("txupport.gk2trackerbridge");
            _harmony.PatchAll(typeof(TrackerPlugin).Assembly);

            Log.LogInfo("GK2TrackerBridge loaded. Output dir: " + OutDir);
        }

        private static readonly FieldInfo GameBalanceInstanceField =
            AccessTools.Field(typeof(GameBalance), "instance");

        internal static GameBalance CurrentGameBalance =>
            GameBalanceInstanceField.GetValue(null) as GameBalance;

        private void Update()
        {
            var gb = CurrentGameBalance;
            if (gb == null) return;

            int totalDefs = (gb.craftDefs?.Count ?? 0) + (gb.buildingDefs?.Count ?? 0) + (gb.townBuildingDefs?.Count ?? 0);
            if (totalDefs > 0 && totalDefs != _lastDumpedCraftCount)
            {
                try
                {
                    RecipeDumper.DumpAll(gb);
                    _lastDumpedCraftCount = totalDefs;
                    Log.LogInfo($"Recipe/item database dumped to recipes.json (Total defs: {totalDefs}, craftDefs: {gb.craftDefs?.Count}, buildingDefs: {gb.buildingDefs?.Count}, townBuildingDefs: {gb.townBuildingDefs?.Count})");
                }
                catch (Exception e)
                {
                    Log.LogError("Recipe dump failed: " + e);
                }
            }
        }

        private void LateUpdate()
        {
            _inventoryTimer += Time.deltaTime;
            if (_inventoryTimer < InventoryPollSeconds) return;
            _inventoryTimer = 0f;

            try
            {
                InventoryWatcher.WriteSnapshot();
            }
            catch (Exception e)
            {
                Log.LogWarning("Inventory snapshot failed: " + e.Message);
            }
        }
    }

    [HarmonyPatch(typeof(GameBalance), "LoadGameBalance")]
    public static class LoadGameBalancePatch
    {
        [HarmonyPostfix]
        public static void Postfix()
        {
            try
            {
                var gb = TrackerPlugin.CurrentGameBalance;
                if (gb != null)
                {
                    RecipeDumper.DumpAll(gb);
                    TrackerPlugin.Log.LogInfo("LoadGameBalance Postfix: recipes.json dumped successfully!");
                }
            }
            catch (Exception e)
            {
                TrackerPlugin.Log.LogError("LoadGameBalance Postfix error: " + e);
            }
        }
    }

    [HarmonyPatch(typeof(GameBalance), "CreateBuildCache")]
    public static class CreateBuildCachePatch
    {
        [HarmonyPostfix]
        public static void Postfix()
        {
            try
            {
                var gb = TrackerPlugin.CurrentGameBalance;
                if (gb != null)
                {
                    RecipeDumper.DumpAll(gb);
                    TrackerPlugin.Log.LogInfo("CreateBuildCache Postfix: recipes.json dumped successfully!");
                }
            }
            catch (Exception e)
            {
                TrackerPlugin.Log.LogError("CreateBuildCache Postfix error: " + e);
            }
        }
    }
}
