package me.andrei9876.voidstrike.game.model;

public class JoinGameMessage {

    private String type;
    private String name;
    private String characterModel;

    public String getType() {
        return type;
    }

    public String getName() {
        return name;
    }

    public String getCharacterModel() {
        return characterModel;
    }

    public void setType(String type) {
        this.type = type;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setCharacterModel(String characterModel) {
        this.characterModel = characterModel;
    }
}
