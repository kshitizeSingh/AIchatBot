// src/navigation/UserNavigator.tsx
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ChatScreen from '../screens/user/ChatScreen';
import type { UserStackParamList } from '../types';

const Stack = createStackNavigator<UserStackParamList>();

const UserNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#007AFF',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'AI FAQ Assistant' }}
      />
    </Stack.Navigator>
  );
};

export default UserNavigator;