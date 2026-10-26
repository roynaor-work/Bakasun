import bpy, sys, importlib, os, addon_utils
def enable():
    addon_utils.enable("bl_ext.user_default.mpfb", default_set=True, persistent=True)
def imp(pkg, key):
    for amod in list(sys.modules):
        if amod.endswith(pkg):
            return getattr(importlib.import_module(amod), key)
    raise ValueError(pkg)
