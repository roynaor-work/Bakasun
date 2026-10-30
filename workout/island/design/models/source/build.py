"""Rebuild all original assets. Blender 5.2.2 LTS; no network or runtime game edits."""
import os,sys,argparse
sys.dont_write_bytecode=True
sys.path.insert(0,os.path.dirname(__file__))
import venues,equipment,ski_environment
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    for module in (venues,equipment,ski_environment):module.build(a.out)
