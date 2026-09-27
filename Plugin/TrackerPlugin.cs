using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using BepInEx;
using BepInEx.Logging;
using HarmonyLib;
using Newtonsoft.Json;
using UnityEngine;

namespace GKTrackerBridge
{
    [BepInPlugin("txupport.gk2trackerbridge", "GK2 Tracker Bridge", "1.0.0")]
    public class TrackerPlugin : BaseUnityPlugin
    {
        internal static ManualLogSource Log;
        internal static string OutDir;

        private Harmony _harmony;
        private bool _recipesDumped;
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
            if (_recipesDumped) return;
            var gb = CurrentGameBalance;
            if (gb == null) return;

            try
            {
                RecipeDumper.DumpAll(gb);
                _recipesDumped = true;
                Log.LogInfo("Recipe/item database dumped to recipes.json");

                foreach (var sampleId in new[] { "wooden_plank", "nails_bronze", "ingot_bronze", "ingot_iron" })
                {
                    var def = gb.itemDefs.Find(d => d != null && d.id == sampleId);
                    if (def != null) Log.LogInfo($"[name check] {sampleId} -> {RecipeDumper.DebugResolveDisplayName(sampleId)}");
                }
            }
            catch (Exception e)
            {
                Log.LogError("Recipe dump failed: " + e);
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
}
