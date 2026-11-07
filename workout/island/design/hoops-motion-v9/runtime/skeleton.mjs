/** Exact motion2 skeleton contract; unchanged names, parents and bind offsets. */
export const SKELETON = {
  "rotationFormat": "quaternion-xyzw",
  "rotationSpace": "parent-local",
  "rotationMeaning": "absolute canonical local rotation; retarget to target bind before export",
  "axes": {
    "up": "+Y",
    "forward": "+Z",
    "anatomicalLeft": "+X"
  },
  "units": "meters",
  "bones": [
    {
      "name": "Root",
      "parent": null,
      "restTranslationMeters": [
        0,
        0,
        0
      ]
    },
    {
      "name": "Hips",
      "parent": "Root",
      "restTranslationMeters": [
        0,
        0.86,
        0
      ]
    },
    {
      "name": "Spine",
      "parent": "Hips",
      "restTranslationMeters": [
        0,
        0.2,
        0
      ]
    },
    {
      "name": "Chest",
      "parent": "Spine",
      "restTranslationMeters": [
        0,
        0.18,
        0
      ]
    },
    {
      "name": "Neck",
      "parent": "Chest",
      "restTranslationMeters": [
        0,
        0.1,
        0
      ]
    },
    {
      "name": "Head",
      "parent": "Neck",
      "restTranslationMeters": [
        0,
        0.13,
        0
      ]
    },
    {
      "name": "LeftArm",
      "parent": "Chest",
      "restTranslationMeters": [
        0.16,
        0.06,
        0
      ]
    },
    {
      "name": "LeftForeArm",
      "parent": "LeftArm",
      "restTranslationMeters": [
        0,
        -0.27,
        0
      ]
    },
    {
      "name": "LeftHand",
      "parent": "LeftForeArm",
      "restTranslationMeters": [
        0,
        -0.24,
        0
      ]
    },
    {
      "name": "RightArm",
      "parent": "Chest",
      "restTranslationMeters": [
        -0.16,
        0.06,
        0
      ]
    },
    {
      "name": "RightForeArm",
      "parent": "RightArm",
      "restTranslationMeters": [
        0,
        -0.27,
        0
      ]
    },
    {
      "name": "RightHand",
      "parent": "RightForeArm",
      "restTranslationMeters": [
        0,
        -0.24,
        0
      ]
    },
    {
      "name": "LeftUpLeg",
      "parent": "Hips",
      "restTranslationMeters": [
        0.1,
        0,
        0
      ]
    },
    {
      "name": "LeftLeg",
      "parent": "LeftUpLeg",
      "restTranslationMeters": [
        0,
        -0.41,
        0
      ]
    },
    {
      "name": "LeftFoot",
      "parent": "LeftLeg",
      "restTranslationMeters": [
        0,
        -0.37,
        0
      ]
    },
    {
      "name": "RightUpLeg",
      "parent": "Hips",
      "restTranslationMeters": [
        -0.1,
        0,
        0
      ]
    },
    {
      "name": "RightLeg",
      "parent": "RightUpLeg",
      "restTranslationMeters": [
        0,
        -0.41,
        0
      ]
    },
    {
      "name": "RightFoot",
      "parent": "RightLeg",
      "restTranslationMeters": [
        0,
        -0.37,
        0
      ]
    }
  ],
  "designBoneMap": {
    "Root": "root",
    "Hips": "hips",
    "Spine": "spine",
    "Chest": "chest",
    "Neck": "neck",
    "Head": "head",
    "LeftArm": "upper_arm.L",
    "LeftForeArm": "forearm.L",
    "LeftHand": "hand.L",
    "RightArm": "upper_arm.R",
    "RightForeArm": "forearm.R",
    "RightHand": "hand.R",
    "LeftUpLeg": "thigh.L",
    "LeftLeg": "shin.L",
    "LeftFoot": "foot.L",
    "RightUpLeg": "thigh.R",
    "RightLeg": "shin.R",
    "RightFoot": "foot.R"
  }
};
export const CANONICAL_BONE_NAMES = Object.freeze(SKELETON.bones.map(b => b.name));
