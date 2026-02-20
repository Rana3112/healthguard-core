weight=70
height=170
diet_score=4
prompt = f"""
        Act as an expert fitness coach.
        User Profile:
        - Weight: {weight}kg
        - Height: {height}cm
        - Diet Quality: {diet_score}/10
        
        Create a personalized workout plan.
        OUTPUT RULES:
        1. Return ONLY valid JSON. No markdown formatting.
        2. JSON Structure:
        {{
            "analysis": "Brief analysis of physique and diet...",
            "goal": "Recommended Goal (e.g. Weight Loss, Muscle Gain)",
            "days": [
                {{
                    "day_name": "Day 1: Upper Body",
                    "exercises": [
                        {{ "name": "Bench Press", "target": "pectorals", "equipment": "barbell" }},
                        {{ "name": "Lat Pulldown", "target": "lats", "equipment": "cable" }}
                    ]
                }}
            ]
        }}
        3. Use ExerciseDB compatible targets: pectorals, back, legs, abs, arms, shoulders.
        4. Use ExerciseDB compatible equipment: barbell, dumbbell, cable, body weight.
        5. For EACH exercise, you MUST provide an "instructions" array containing 2-4 step-by-step strings on how to perform the movement. This is REQUIRED.
        Example exercise object:
        {{ "name": "Push Up", "target": "pectorals", "equipment": "body weight", "instructions": ["Get into a plank position.", "Lower your body until chest touches the floor.", "Push back up."] }}
        """
print(prompt)
